use std::path::{Path, PathBuf};
use std::sync::Arc;

use crate::cloud::{CloudProjectDto, CloudWorkspace};

#[derive(Debug, Clone)]
pub enum Workspace {
    Local(PathBuf),
    Cloud(Arc<CloudWorkspace>),
}

impl Workspace {
    pub fn from_cloud_project(info: CloudProjectDto) -> Self {
        Workspace::Cloud(Arc::new(CloudWorkspace::from_project(info)))
    }

    pub fn key(&self) -> String {
        match self {
            Workspace::Local(path) => path.to_string_lossy().to_string(),
            Workspace::Cloud(cloud) => cloud.workspace_uri.clone(),
        }
    }

    pub fn local_path(&self) -> Option<&Path> {
        match self {
            Workspace::Local(path) => Some(path.as_path()),
            Workspace::Cloud(_) => None,
        }
    }

    pub fn cloud(&self) -> Option<&Arc<CloudWorkspace>> {
        match self {
            Workspace::Local(_) => None,
            Workspace::Cloud(cloud) => Some(cloud),
        }
    }
}
