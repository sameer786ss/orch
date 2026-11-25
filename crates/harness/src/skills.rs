use std::collections::HashSet;
use std::path::Path;
use std::sync::{Arc, LazyLock};

use gray_matter::engine::YAML;
use gray_matter::Matter;
use include_dir::{include_dir, Dir};
use serde::Deserialize;

#[derive(Debug, Clone)]
pub struct Skill {
    pub name: String,
    pub description: String,
    pub file_path: String,
}

static EMBEDDED_SKILLS_DIR: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/skills");

pub fn load_embedded_skills() -> Arc<[Skill]> {
    static EMBEDDED: LazyLock<Arc<[Skill]>> = LazyLock::new(|| {
        let mut skills = Vec::new();
        let mut seen = HashSet::new();
        if let Ok(files) = EMBEDDED_SKILLS_DIR.find("**/SKILL.md") {
            for entry in files {
                if let include_dir::DirEntry::File(f) = entry
                    && let Some(raw) = f.contents_utf8()
                    && let Some(skill) = parse_skill_markdown(raw, f.path())
                    && seen.insert(skill.name.to_lowercase())
                {
                    skills.push(skill);
                }
            }
        }
        skills.sort_by(|a, b| a.name.cmp(&b.name));
        skills.into()
    });
    EMBEDDED.clone()
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

#[derive(Deserialize, Default)]
struct SkillFrontmatter {
    name: Option<String>,
    description: Option<String>,
}

pub fn parse_skill_markdown(raw: &str, file_path: &Path) -> Option<Skill> {
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
