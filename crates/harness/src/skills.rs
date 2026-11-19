use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::{Arc, OnceLock};
use std::time::Duration;

use gray_matter::engine::YAML;
use gray_matter::Matter;
use include_dir::{include_dir, Dir};
use moka::sync::Cache;
use serde::Deserialize;

#[derive(Debug, Clone)]
pub struct Skill {
    pub name: String,
    pub description: String,
    pub file_path: String,
}

static EMBEDDED_SKILLS_DIR: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/skills");

const BUNDLED_VERSION: &str = "v5";

pub fn seed_bundled_skills(data_dir: &Path) {
    let global_skills_dir = data_dir.join("skills");
    let version_file = global_skills_dir.join(".version");

    if version_file.exists()
        && std::fs::read_to_string(&version_file).ok().as_deref() == Some(BUNDLED_VERSION)
    {
        return;
    }

    if let Err(e) = std::fs::create_dir_all(&global_skills_dir) {
        tracing::error!(error = %e, "failed to create skills directory");
        return;
    }

    if let Ok(files) = EMBEDDED_SKILLS_DIR.find("**/*") {
        for file in files {
            if let include_dir::DirEntry::File(f) = file {
                let target_path = global_skills_dir.join(f.path());
                if let Some(parent) = target_path.parent() {
                    let _ = std::fs::create_dir_all(parent);
                }
                let _ = std::fs::write(&target_path, f.contents());
            }
        }
    }

    let _ = std::fs::write(&version_file, BUNDLED_VERSION);
}

const SKILLS_CACHE_TTL: Duration = Duration::from_secs(10);

fn skills_cache() -> &'static Cache<PathBuf, Arc<[Skill]>> {
    static CACHE: OnceLock<Cache<PathBuf, Arc<[Skill]>>> = OnceLock::new();
    CACHE.get_or_init(|| {
        Cache::builder()
            .time_to_live(SKILLS_CACHE_TTL)
            .build()
    })
}

pub fn load_embedded_skills() -> Arc<[Skill]> {
    static EMBEDDED: OnceLock<Arc<[Skill]>> = OnceLock::new();
    EMBEDDED
        .get_or_init(|| {
            let mut skills = Vec::new();
            let mut seen = HashSet::new();
            if let Ok(files) = EMBEDDED_SKILLS_DIR.find("**/SKILL.md") {
                for entry in files {
                    if let include_dir::DirEntry::File(f) = entry {
                        if let Some(raw) = f.contents_utf8() {
                            if let Some(skill) = parse_skill_markdown(raw, f.path()) {
                                if seen.insert(skill.name.to_lowercase()) {
                                    skills.push(skill);
                                }
                            }
                        }
                    }
                }
            }
            skills.sort_by(|a, b| a.name.cmp(&b.name));
            skills.into()
        })
        .clone()
}

pub fn read_embedded_skill(name: &str) -> Result<String, String> {
    let target = name.trim().to_lowercase();
    let skills = load_embedded_skills();
    let skill = skills
        .iter()
        .find(|s| s.name.to_lowercase() == target)
        .ok_or_else(|| format!("no skill named '{name}'"))?;
    let file = EMBEDDED_SKILLS_DIR
        .get_file(&skill.file_path)
        .ok_or_else(|| format!("skill '{name}' file is missing"))?;
    file.contents_utf8()
        .map(str::to_string)
        .ok_or_else(|| format!("skill '{name}' is not valid UTF-8"))
}

pub async fn load_all_skills(data_dir: PathBuf) -> Arc<[Skill]> {
    let skills_dir = data_dir.join("skills");
    if let Some(cached) = skills_cache().get(&skills_dir) {
        return cached;
    }
    tokio::task::spawn_blocking(move || {
        skills_cache().get_with(skills_dir.clone(), || {
            let mut skills = Vec::new();
            let mut seen = HashSet::new();

            scan_skills_directory(&skills_dir, &mut skills, &mut seen);

            skills.sort_by(|a, b| a.name.cmp(&b.name));
            skills.into()
        })
    })
    .await
    .unwrap_or_else(|_| Arc::new([]))
}

pub async fn read_skill_from_dir(data_dir: PathBuf, name: &str) -> Result<String, String> {
    let skills = load_all_skills(data_dir).await;
    let target = name.trim().to_lowercase();
    let skill = skills
        .iter()
        .find(|s| s.name.to_lowercase() == target)
        .ok_or_else(|| format!("no skill named '{name}'"))?;
    tokio::fs::read_to_string(&skill.file_path)
        .await
        .map_err(|e| format!("cannot read skill '{name}': {e}"))
}

fn scan_skills_directory(dir: &Path, out: &mut Vec<Skill>, seen: &mut HashSet<String>) {
    if !dir.is_dir() {
        return;
    }
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let skill_file = if path.is_dir() {
            let candidate = path.join("SKILL.md");
            if !candidate.is_file() {
                continue;
            }
            candidate
        } else if path.extension().and_then(|s| s.to_str()) == Some("md") {
            path
        } else {
            continue;
        };

        let Ok(raw) = std::fs::read_to_string(&skill_file) else {
            continue;
        };
        let Some(skill) = parse_skill_markdown(&raw, &skill_file) else {
            continue;
        };
        if seen.insert(skill.name.to_lowercase()) {
            out.push(skill);
        }
    }
}

#[derive(Deserialize, Default)]
struct SkillFrontmatter {
    name: Option<String>,
    description: Option<String>,
}

fn parse_skill_markdown(raw: &str, file_path: &Path) -> Option<Skill> {
    let fallback_name = if file_path.file_name().and_then(|s| s.to_str()) == Some("SKILL.md") {
        file_path.parent().and_then(|p| p.file_name())
    } else {
        file_path.file_stem()
    }
    .map(|s| s.to_string_lossy().to_string())?;
    let normalized_path = file_path.to_string_lossy().replace('\\', "/");

    let matter = Matter::<YAML>::new();
    let parsed = matter.parse_with_struct::<SkillFrontmatter>(raw);

    let (name, description) = if let Some(parsed_data) = parsed {
        let fm = parsed_data.data;
        let n = fm.name.unwrap_or_else(|| fallback_name.clone());
        let d = fm.description.unwrap_or_default();
        (n, d)
    } else {
        (fallback_name, String::new())
    };

    if description.trim().is_empty() {
        return None;
    }

    Some(Skill {
        name,
        description: description.trim().to_string(),
        file_path: normalized_path,
    })
}
