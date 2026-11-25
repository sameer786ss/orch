package com.orch.app.ui.icons

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.PathBuilder
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.unit.dp

/**
 * Lightweight subset of Material vector icons previously pulled from the ~30 MB
 * `material-icons-extended` artifact.
 */
object OrchIcons {

    val ArrowDownward: ImageVector by lazy {
        icon("ArrowDownward") {
            moveTo(11f, 4f); verticalLineToRelative(12.17f); lineToRelative(-5.59f, -5.59f)
            lineTo(4f, 12f); lineToRelative(8f, 8f); lineToRelative(8f, -8f)
            lineToRelative(-1.41f, -1.41f); lineTo(13f, 16.17f); verticalLineTo(4f); close()
        }
    }

    val ArrowUpward: ImageVector by lazy {
        icon("ArrowUpward") {
            moveTo(4f, 12f); lineToRelative(1.41f, 1.41f); lineTo(11f, 7.83f)
            verticalLineTo(20f); horizontalLineToRelative(2f); verticalLineTo(7.83f)
            lineToRelative(5.58f, 5.59f); lineTo(20f, 12f); lineToRelative(-8f, -8f); close()
        }
    }

    val AttachFile: ImageVector by lazy {
        icon("AttachFile") {
            moveTo(16.5f, 6f); verticalLineToRelative(11.5f)
            curveToRelative(0f, 2.21f, -1.79f, 4f, -4f, 4f)
            reflectiveCurveToRelative(-4f, -1.79f, -4f, -4f)
            verticalLineTo(5f); curveToRelative(0f, -1.38f, 1.12f, -2.5f, 2.5f, -2.5f)
            reflectiveCurveToRelative(2.5f, 1.12f, 2.5f, 2.5f); verticalLineToRelative(10.5f)
            curveToRelative(0f, 0.55f, -0.45f, 1f, -1f, 1f); reflectiveCurveToRelative(-1f, -0.45f, -1f, -1f)
            verticalLineTo(6f); horizontalLineTo(10f); verticalLineToRelative(9.5f)
            curveToRelative(0f, 1.38f, 1.12f, 2.5f, 2.5f, 2.5f)
            reflectiveCurveToRelative(2.5f, -1.12f, 2.5f, -2.5f); verticalLineTo(5f)
            curveToRelative(0f, -2.21f, -1.79f, -4f, -4f, -4f); reflectiveCurveTo(7f, 2.79f, 7f, 5f)
            verticalLineToRelative(12.5f); curveToRelative(0f, 3.04f, 2.46f, 5.5f, 5.5f, 5.5f)
            reflectiveCurveToRelative(5.5f, -2.46f, 5.5f, -5.5f); verticalLineTo(6f); close()
        }
    }

    val ChevronRight: ImageVector by lazy {
        icon("ChevronRight") {
            moveTo(9.29f, 6.71f); curveToRelative(-0.39f, 0.39f, -0.39f, 1.02f, 0f, 1.41f)
            lineTo(13.17f, 12f); lineToRelative(-3.88f, 3.88f)
            curveToRelative(-0.39f, 0.39f, -0.39f, 1.02f, 0f, 1.41f)
            curveToRelative(0.39f, 0.39f, 1.02f, 0.39f, 1.41f, 0f)
            lineToRelative(4.59f, -4.59f); curveToRelative(0.39f, -0.39f, 0.39f, -1.02f, 0f, -1.41f)
            lineTo(10.7f, 6.7f); curveToRelative(-0.38f, -0.38f, -1.02f, -0.38f, -1.41f, 0.01f); close()
        }
    }

    val ContentCopy: ImageVector by lazy {
        icon("ContentCopy") {
            moveTo(16f, 1f); horizontalLineTo(4f); curveToRelative(-1.1f, 0f, -2f, 0.9f, -2f, 2f)
            verticalLineToRelative(14f); horizontalLineToRelative(2f); verticalLineTo(3f)
            horizontalLineToRelative(12f); verticalLineTo(1f); close()
            moveTo(19f, 5f); horizontalLineTo(8f); curveToRelative(-1.1f, 0f, -2f, 0.9f, -2f, 2f)
            verticalLineToRelative(14f); curveToRelative(0f, 1.1f, 0.9f, 2f, 2f, 2f)
            horizontalLineToRelative(11f); curveToRelative(1.1f, 0f, 2f, -0.9f, 2f, -2f)
            verticalLineTo(7f); curveToRelative(0f, -1.1f, -0.9f, -2f, -2f, -2f); close()
            moveTo(19f, 21f); horizontalLineTo(8f); verticalLineTo(7f); horizontalLineToRelative(11f)
            verticalLineToRelative(14f); close()
        }
    }

    val CreateNewFolder: ImageVector by lazy {
        icon("CreateNewFolder") {
            moveTo(20f, 6f); horizontalLineToRelative(-8f); lineToRelative(-2f, -2f); horizontalLineTo(4f)
            curveToRelative(-1.11f, 0f, -1.99f, 0.89f, -1.99f, 2f); lineTo(2f, 18f)
            curveToRelative(0f, 1.11f, 0.89f, 2f, 2f, 2f); horizontalLineToRelative(16f)
            curveToRelative(1.11f, 0f, 2f, -0.89f, 2f, -2f); verticalLineTo(8f)
            curveToRelative(0f, -1.11f, -0.89f, -2f, -2f, -2f); close()
            moveTo(20f, 18f); horizontalLineTo(4f); verticalLineTo(6f); horizontalLineToRelative(5.17f)
            lineToRelative(2f, 2f); horizontalLineTo(20f); verticalLineToRelative(10f); close()
            moveTo(12f, 14f); horizontalLineToRelative(2f); verticalLineToRelative(2f)
            horizontalLineToRelative(2f); verticalLineToRelative(-2f); horizontalLineToRelative(2f)
            verticalLineToRelative(-2f); horizontalLineToRelative(-2f); verticalLineToRelative(-2f)
            horizontalLineToRelative(-2f); verticalLineToRelative(2f); horizontalLineToRelative(-2f); close()
        }
    }

    val DeleteSweep: ImageVector by lazy {
        icon("DeleteSweep") {
            moveTo(15f, 16f); horizontalLineToRelative(4f); verticalLineToRelative(2f); horizontalLineToRelative(-4f); close()
            moveTo(15f, 8f); horizontalLineToRelative(7f); verticalLineToRelative(2f); horizontalLineToRelative(-7f); close()
            moveTo(15f, 12f); horizontalLineToRelative(6f); verticalLineToRelative(2f); horizontalLineToRelative(-6f); close()
            moveTo(3f, 18f); curveToRelative(0f, 1.1f, 0.9f, 2f, 2f, 2f); horizontalLineToRelative(6f)
            curveToRelative(1.1f, 0f, 2f, -0.9f, 2f, -2f); verticalLineTo(8f); horizontalLineTo(3f); verticalLineToRelative(10f); close()
            moveTo(5f, 10f); horizontalLineToRelative(6f); verticalLineToRelative(8f); horizontalLineTo(5f); verticalLineToRelative(-8f); close()
            moveTo(10f, 4f); horizontalLineTo(6f); lineTo(5f, 5f); horizontalLineTo(2f)
            verticalLineToRelative(2f); horizontalLineToRelative(12f); verticalLineTo(5f)
            horizontalLineToRelative(-3f); close()
        }
    }

    val Download: ImageVector by lazy {
        icon("Download") {
            moveTo(19f, 9f); horizontalLineToRelative(-4f); verticalLineTo(3f); horizontalLineTo(9f)
            verticalLineToRelative(6f); horizontalLineTo(5f); lineToRelative(7f, 7f); lineToRelative(7f, -7f); close()
            moveTo(11f, 11f); verticalLineTo(5f); horizontalLineToRelative(2f); verticalLineToRelative(6f)
            horizontalLineToRelative(1.17f); lineTo(12f, 13.17f); lineTo(9.83f, 11f); horizontalLineTo(11f); close()
            moveTo(5f, 18f); horizontalLineToRelative(14f); verticalLineToRelative(2f); horizontalLineTo(5f); close()
        }
    }

    val Extension: ImageVector by lazy {
        icon("Extension") {
            moveTo(10.5f, 4.5f); curveToRelative(0.28f, 0f, 0.5f, 0.22f, 0.5f, 0.5f); verticalLineToRelative(2f)
            horizontalLineToRelative(6f); verticalLineToRelative(6f); horizontalLineToRelative(2f)
            curveToRelative(0.28f, 0f, 0.5f, 0.22f, 0.5f, 0.5f); reflectiveCurveToRelative(-0.22f, 0.5f, -0.5f, 0.5f)
            horizontalLineToRelative(-2f); verticalLineToRelative(6f); horizontalLineToRelative(-2.12f)
            curveToRelative(-0.68f, -1.75f, -2.39f, -3f, -4.38f, -3f); reflectiveCurveToRelative(-3.7f, 1.25f, -4.38f, 3f)
            horizontalLineTo(4f); verticalLineToRelative(-2.12f)
            curveToRelative(1.75f, -0.68f, 3f, -2.39f, 3f, -4.38f); reflectiveCurveToRelative(-1.25f, -3.7f, -3f, -4.38f)
            verticalLineTo(7f); horizontalLineToRelative(6f); verticalLineTo(5f)
            curveToRelative(0f, -0.28f, 0.22f, -0.5f, 0.5f, -0.5f)
            moveTo(10.5f, 2.5f); curveTo(9.12f, 2.5f, 8f, 3.62f, 8f, 5f); horizontalLineTo(4f)
            curveToRelative(-1.1f, 0f, -1.99f, 0.9f, -1.99f, 2f); verticalLineToRelative(3.8f); horizontalLineToRelative(0.29f)
            curveToRelative(1.49f, 0f, 2.7f, 1.21f, 2.7f, 2.7f); reflectiveCurveToRelative(-1.21f, 2.7f, -2.7f, 2.7f)
            horizontalLineTo(2f); verticalLineTo(20f); curveToRelative(0f, 1.1f, 0.9f, 2f, 2f, 2f)
            horizontalLineToRelative(3.8f); verticalLineToRelative(-0.3f)
            curveToRelative(0f, -1.49f, 1.21f, -2.7f, 2.7f, -2.7f); reflectiveCurveToRelative(2.7f, 1.21f, 2.7f, 2.7f)
            verticalLineToRelative(0.3f); horizontalLineTo(17f); curveToRelative(1.1f, 0f, 2f, -0.9f, 2f, -2f)
            verticalLineToRelative(-4f); curveToRelative(1.38f, 0f, 2.5f, -1.12f, 2.5f, -2.5f)
            reflectiveCurveTo(20.38f, 11f, 19f, 11f); verticalLineTo(7f); curveToRelative(0f, -1.1f, -0.9f, -2f, -2f, -2f)
            horizontalLineToRelative(-4f); curveToRelative(0f, -1.38f, -1.12f, -2.5f, -2.5f, -2.5f); close()
        }
    }

    val Folder: ImageVector by lazy {
        icon("Folder") {
            moveTo(9.17f, 6f); lineToRelative(2f, 2f); horizontalLineTo(20f); verticalLineToRelative(10f)
            horizontalLineTo(4f); verticalLineTo(6f); horizontalLineToRelative(5.17f)
            moveTo(10f, 4f); horizontalLineTo(4f); curveToRelative(-1.1f, 0f, -1.99f, 0.9f, -1.99f, 2f)
            lineTo(2f, 18f); curveToRelative(0f, 1.1f, 0.9f, 2f, 2f, 2f); horizontalLineToRelative(16f)
            curveToRelative(1.1f, 0f, 2f, -0.9f, 2f, -2f); verticalLineTo(8f)
            curveToRelative(0f, -1.1f, -0.9f, -2f, -2f, -2f); horizontalLineToRelative(-8f); close()
        }
    }

    val FolderOpen: ImageVector by lazy {
        icon("FolderOpen") {
            moveTo(20f, 6f); horizontalLineToRelative(-8f); lineToRelative(-2f, -2f); horizontalLineTo(4f)
            curveToRelative(-1.1f, 0f, -1.99f, 0.9f, -1.99f, 2f); lineTo(2f, 18f)
            curveToRelative(0f, 1.1f, 0.9f, 2f, 2f, 2f); horizontalLineToRelative(16f)
            curveToRelative(1.1f, 0f, 2f, -0.9f, 2f, -2f); verticalLineTo(8f)
            curveToRelative(0f, -1.1f, -0.9f, -2f, -2f, -2f); close()
            moveTo(20f, 18f); horizontalLineTo(4f); verticalLineTo(8f); horizontalLineToRelative(16f)
            verticalLineToRelative(10f); close()
        }
    }

    val Image: ImageVector by lazy {
        icon("Image") {
            moveTo(19f, 5f); verticalLineToRelative(14f); horizontalLineTo(5f); verticalLineTo(5f); horizontalLineToRelative(14f)
            moveTo(19f, 3f); horizontalLineTo(5f); curveToRelative(-1.1f, 0f, -2f, 0.9f, -2f, 2f)
            verticalLineToRelative(14f); curveToRelative(0f, 1.1f, 0.9f, 2f, 2f, 2f); horizontalLineToRelative(14f)
            curveToRelative(1.1f, 0f, 2f, -0.9f, 2f, -2f); verticalLineTo(5f)
            curveToRelative(0f, -1.1f, -0.9f, -2f, -2f, -2f); close()
            moveTo(14.14f, 11.86f); lineToRelative(-3f, 3.87f); lineTo(9f, 13.14f)
            lineTo(6f, 17f); horizontalLineToRelative(12f); close()
        }
    }

    val InsertDriveFile: ImageVector by lazy {
        icon("InsertDriveFile") {
            moveTo(14f, 2f); horizontalLineTo(6f); curveToRelative(-1.1f, 0f, -1.99f, 0.9f, -1.99f, 2f)
            lineTo(4f, 20f); curveToRelative(0f, 1.1f, 0.89f, 2f, 1.99f, 2f); horizontalLineTo(18f)
            curveToRelative(1.1f, 0f, 2f, -0.9f, 2f, -2f); verticalLineTo(8f); close()
            moveTo(6f, 20f); verticalLineTo(4f); horizontalLineToRelative(7f); verticalLineToRelative(5f)
            horizontalLineToRelative(5f); verticalLineToRelative(11f); close()
        }
    }

    val KeyboardReturn: ImageVector by lazy {
        icon("KeyboardReturn", autoMirror = true) {
            moveTo(19f, 7f); verticalLineToRelative(4f); horizontalLineTo(5.83f)
            lineToRelative(3.58f, -3.59f); lineTo(8f, 6f); lineToRelative(-6f, 6f)
            lineToRelative(6f, 6f); lineToRelative(1.41f, -1.41f); lineTo(5.83f, 13f)
            horizontalLineTo(21f); verticalLineTo(7f); close()
        }
    }

    val Language: ImageVector by lazy {
        icon("Language") {
            moveTo(11.99f, 2f); curveTo(6.47f, 2f, 2f, 6.48f, 2f, 12f)
            reflectiveCurveToRelative(4.47f, 10f, 9.99f, 10f); curveTo(17.52f, 22f, 22f, 17.52f, 22f, 12f)
            reflectiveCurveTo(17.52f, 2f, 11.99f, 2f); close()
            moveTo(18.92f, 8f); horizontalLineToRelative(-2.95f)
            curveToRelative(-0.32f, -1.25f, -0.78f, -2.45f, -1.38f, -3.56f)
            curveToRelative(1.84f, 0.63f, 3.37f, 1.91f, 4.33f, 3.56f); close()
            moveTo(12f, 4.04f); curveToRelative(0.83f, 1.2f, 1.48f, 2.53f, 1.91f, 3.96f)
            horizontalLineToRelative(-3.82f); curveToRelative(0.43f, -1.43f, 1.08f, -2.76f, 1.91f, -3.96f); close()
            moveTo(4.26f, 14f); curveTo(4.1f, 13.36f, 4f, 12.69f, 4f, 12f); reflectiveCurveToRelative(0.1f, -1.36f, 0.26f, -2f)
            horizontalLineToRelative(3.38f); curveToRelative(-0.08f, 0.66f, -0.14f, 1.32f, -0.14f, 2f)
            reflectiveCurveToRelative(0.06f, 1.34f, 0.14f, 2f); close()
            moveTo(5.08f, 16f); horizontalLineToRelative(2.95f)
            curveToRelative(0.32f, 1.25f, 0.78f, 2.45f, 1.38f, 3.56f)
            curveToRelative(-1.84f, -0.63f, -3.37f, -1.9f, -4.33f, -3.56f); close()
            moveTo(8.03f, 8f); horizontalLineTo(5.08f)
            curveToRelative(0.96f, -1.66f, 2.49f, -2.93f, 4.33f, -3.56f)
            curveTo(8.81f, 5.55f, 8.35f, 6.75f, 8.03f, 8f); close()
            moveTo(12f, 19.96f); curveToRelative(-0.83f, -1.2f, -1.48f, -2.53f, -1.91f, -3.96f)
            horizontalLineToRelative(3.82f); curveToRelative(-0.43f, 1.43f, -1.08f, 2.76f, -1.91f, 3.96f); close()
            moveTo(14.34f, 14f); horizontalLineTo(9.66f)
            curveToRelative(-0.09f, -0.66f, -0.16f, -1.32f, -0.16f, -2f)
            reflectiveCurveToRelative(0.07f, -1.35f, 0.16f, -2f); horizontalLineToRelative(4.68f)
            curveToRelative(0.09f, 0.65f, 0.16f, 1.32f, 0.16f, 2f); reflectiveCurveToRelative(-0.07f, 1.34f, -0.16f, 2f); close()
            moveTo(14.59f, 19.56f); curveToRelative(0.6f, -1.11f, 1.06f, -2.31f, 1.38f, -3.56f)
            horizontalLineToRelative(2.95f); curveToRelative(-0.96f, 1.65f, -2.49f, 2.93f, -4.33f, 3.56f); close()
            moveTo(16.36f, 14f); curveToRelative(0.08f, -0.66f, 0.14f, -1.32f, 0.14f, -2f)
            reflectiveCurveToRelative(-0.06f, -1.34f, -0.14f, -2f); horizontalLineToRelative(3.38f)
            curveToRelative(0.16f, 0.64f, 0.26f, 1.31f, 0.26f, 2f); reflectiveCurveToRelative(-0.1f, 1.36f, -0.26f, 2f); close()
        }
    }

    val Logout: ImageVector by lazy {
        icon("Logout", autoMirror = true) {
            moveTo(17f, 7f); lineToRelative(-1.41f, 1.41f); lineTo(18.17f, 11f); horizontalLineTo(8f)
            verticalLineToRelative(2f); horizontalLineToRelative(10.17f); lineToRelative(-2.58f, 2.58f)
            lineTo(17f, 17f); lineToRelative(5f, -5f); close()
            moveTo(4f, 5f); horizontalLineToRelative(8f); verticalLineTo(3f); horizontalLineTo(4f)
            curveToRelative(-1.1f, 0f, -2f, 0.9f, -2f, 2f); verticalLineToRelative(14f)
            curveToRelative(0f, 1.1f, 0.9f, 2f, 2f, 2f); horizontalLineToRelative(8f); verticalLineToRelative(-2f)
            horizontalLineTo(4f); close()
        }
    }

    val Memory: ImageVector by lazy {
        icon("Memory") {
            moveTo(15f, 9f); horizontalLineTo(9f); verticalLineToRelative(6f); horizontalLineToRelative(6f); close()
            moveTo(13f, 13f); horizontalLineToRelative(-2f); verticalLineToRelative(-2f); horizontalLineToRelative(2f); close()
            moveTo(21f, 11f); verticalLineTo(9f); horizontalLineToRelative(-2f); verticalLineTo(7f)
            curveToRelative(0f, -1.1f, -0.9f, -2f, -2f, -2f); horizontalLineToRelative(-2f); verticalLineTo(3f)
            horizontalLineToRelative(-2f); verticalLineToRelative(2f); horizontalLineToRelative(-2f); verticalLineTo(3f)
            horizontalLineTo(9f); verticalLineToRelative(2f); horizontalLineTo(7f)
            curveToRelative(-1.1f, 0f, -2f, 0.9f, -2f, 2f); verticalLineToRelative(2f); horizontalLineTo(3f)
            verticalLineToRelative(2f); horizontalLineToRelative(2f); verticalLineToRelative(2f); horizontalLineTo(3f)
            verticalLineToRelative(2f); horizontalLineToRelative(2f); verticalLineToRelative(2f)
            curveToRelative(0f, 1.1f, 0.9f, 2f, 2f, 2f); horizontalLineToRelative(2f); verticalLineToRelative(2f)
            horizontalLineToRelative(2f); verticalLineToRelative(-2f); horizontalLineToRelative(2f); verticalLineToRelative(2f)
            horizontalLineToRelative(2f); verticalLineToRelative(-2f); horizontalLineToRelative(2f)
            curveToRelative(1.1f, 0f, 2f, -0.9f, 2f, -2f); verticalLineToRelative(-2f); horizontalLineToRelative(2f)
            verticalLineToRelative(-2f); horizontalLineToRelative(-2f); verticalLineToRelative(-2f); close()
            moveTo(17f, 17f); horizontalLineTo(7f); verticalLineTo(7f); horizontalLineToRelative(10f); close()
        }
    }

    val MenuBook: ImageVector by lazy {
        icon("MenuBook") {
            moveTo(21f, 5f); curveToRelative(-1.11f, -0.35f, -2.33f, -0.5f, -3.5f, -0.5f)
            curveToRelative(-1.95f, 0f, -4.05f, 0.4f, -5.5f, 1.5f)
            curveToRelative(-1.45f, -1.1f, -3.55f, -1.5f, -5.5f, -1.5f)
            reflectiveCurveTo(2.45f, 4.9f, 1f, 6f); verticalLineToRelative(14.65f)
            curveToRelative(0f, 0.25f, 0.25f, 0.5f, 0.5f, 0.5f); curveToRelative(0.1f, 0f, 0.15f, -0.05f, 0.25f, -0.05f)
            curveTo(3.1f, 20.45f, 5.05f, 20f, 6.5f, 20f); curveToRelative(1.95f, 0f, 4.05f, 0.4f, 5.5f, 1.5f)
            curveToRelative(1.35f, -0.85f, 3.8f, -1.5f, 5.5f, -1.5f)
            curveToRelative(1.65f, 0f, 3.35f, 0.3f, 4.75f, 1.05f)
            curveToRelative(0.1f, 0.05f, 0.15f, 0.05f, 0.25f, 0.05f)
            curveToRelative(0.25f, 0f, 0.5f, -0.25f, 0.5f, -0.5f); verticalLineTo(6f)
            curveToRelative(-0.6f, -0.45f, -1.25f, -0.75f, -2f, -1f); close()
            moveTo(21f, 18.5f); curveToRelative(-1.1f, -0.35f, -2.3f, -0.5f, -3.5f, -0.5f)
            curveToRelative(-1.7f, 0f, -4.15f, 0.65f, -5.5f, 1.5f); verticalLineTo(8f)
            curveToRelative(1.35f, -0.85f, 3.8f, -1.5f, 5.5f, -1.5f)
            curveToRelative(1.2f, 0f, 2.4f, 0.15f, 3.5f, 0.5f); close()
        }
    }

    val Mic: ImageVector by lazy {
        icon("Mic") {
            moveTo(12f, 14f); curveToRelative(1.66f, 0f, 3f, -1.34f, 3f, -3f); verticalLineTo(5f)
            curveToRelative(0f, -1.66f, -1.34f, -3f, -3f, -3f); reflectiveCurveTo(9f, 3.34f, 9f, 5f)
            verticalLineToRelative(6f); curveToRelative(0f, 1.66f, 1.34f, 3f, 3f, 3f); close()
            moveTo(11f, 5f); curveToRelative(0f, -0.55f, 0.45f, -1f, 1f, -1f)
            reflectiveCurveToRelative(1f, 0.45f, 1f, 1f); verticalLineToRelative(6f)
            curveToRelative(0f, 0.55f, -0.45f, 1f, -1f, 1f); reflectiveCurveToRelative(-1f, -0.45f, -1f, -1f); close()
            moveTo(17f, 11f); curveToRelative(0f, 2.76f, -2.24f, 5f, -5f, 5f)
            reflectiveCurveToRelative(-5f, -2.24f, -5f, -5f); horizontalLineTo(5f)
            curveToRelative(0f, 3.53f, 2.61f, 6.43f, 6f, 6.92f); verticalLineTo(21f)
            horizontalLineToRelative(2f); verticalLineToRelative(-3.08f)
            curveToRelative(3.39f, -0.49f, 6f, -3.39f, 6f, -6.92f); close()
        }
    }

    val Public: ImageVector by lazy {
        icon("Public") {
            moveTo(12f, 2f); curveTo(6.48f, 2f, 2f, 6.48f, 2f, 12f)
            reflectiveCurveToRelative(4.48f, 10f, 10f, 10f); reflectiveCurveToRelative(10f, -4.48f, 10f, -10f)
            reflectiveCurveTo(17.52f, 2f, 12f, 2f); close()
            moveTo(4f, 12f); curveToRelative(0f, -0.61f, 0.08f, -1.21f, 0.21f, -1.78f)
            lineTo(8.99f, 15f); verticalLineToRelative(1f); curveToRelative(0f, 1.1f, 0.9f, 2f, 2f, 2f)
            verticalLineToRelative(1.93f); curveTo(7.06f, 19.43f, 4f, 16.07f, 4f, 12f); close()
            moveTo(17.89f, 17.4f); curveToRelative(-0.26f, -0.81f, -1f, -1.4f, -1.9f, -1.4f)
            horizontalLineToRelative(-1f); verticalLineToRelative(-3f); curveToRelative(0f, -0.55f, -0.45f, -1f, -1f, -1f)
            horizontalLineToRelative(-6f); verticalLineToRelative(-2f); horizontalLineToRelative(2f)
            curveToRelative(0.55f, 0f, 1f, -0.45f, 1f, -1f); verticalLineTo(7f); horizontalLineToRelative(2f)
            curveToRelative(1.1f, 0f, 2f, -0.9f, 2f, -2f); verticalLineToRelative(-0.41f)
            curveTo(17.92f, 5.77f, 20f, 8.65f, 20f, 12f)
            curveToRelative(0f, 2.08f, -0.81f, 3.98f, -2.11f, 5.4f); close()
        }
    }

    val Stop: ImageVector by lazy {
        icon("Stop") {
            moveTo(8f, 6f); horizontalLineToRelative(8f); curveToRelative(1.1f, 0f, 2f, 0.9f, 2f, 2f)
            verticalLineToRelative(8f); curveToRelative(0f, 1.1f, -0.9f, 2f, -2f, 2f)
            horizontalLineTo(8f); curveToRelative(-1.1f, 0f, -2f, -0.9f, -2f, -2f)
            verticalLineTo(8f); curveToRelative(0f, -1.1f, 0.9f, -2f, 2f, -2f); close()
        }
    }

    val StopCircle: ImageVector by lazy {
        icon("StopCircle") {
            moveTo(12f, 2f); curveTo(6.48f, 2f, 2f, 6.48f, 2f, 12f)
            reflectiveCurveToRelative(4.48f, 10f, 10f, 10f); reflectiveCurveToRelative(10f, -4.48f, 10f, -10f)
            reflectiveCurveTo(17.52f, 2f, 12f, 2f); close()
            moveTo(12f, 20f); curveToRelative(-4.42f, 0f, -8f, -3.58f, -8f, -8f)
            reflectiveCurveToRelative(3.58f, -8f, 8f, -8f); reflectiveCurveToRelative(8f, 3.58f, 8f, 8f)
            reflectiveCurveToRelative(-3.58f, 8f, -8f, 8f); close()
            moveTo(16f, 16f); horizontalLineTo(8f); verticalLineTo(8f); horizontalLineToRelative(8f); close()
        }
    }

    val Terminal: ImageVector by lazy {
        icon("Terminal") {
            moveTo(20f, 4f); horizontalLineTo(4f); curveToRelative(-1.11f, 0f, -2f, 0.9f, -2f, 2f)
            verticalLineToRelative(12f); curveToRelative(0f, 1.1f, 0.89f, 2f, 2f, 2f); horizontalLineToRelative(16f)
            curveToRelative(1.1f, 0f, 2f, -0.9f, 2f, -2f); verticalLineTo(6f)
            curveToRelative(0f, -1.1f, -0.89f, -2f, -2f, -2f); close()
            moveTo(20f, 18f); horizontalLineTo(4f); verticalLineTo(8f); horizontalLineToRelative(16f); close()
            moveTo(18f, 17f); horizontalLineToRelative(-6f); verticalLineToRelative(-2f); horizontalLineToRelative(6f); close()
            moveTo(7.5f, 17f); lineToRelative(-1.41f, -1.41f); lineTo(8.67f, 13f)
            lineToRelative(-2.59f, -2.59f); lineTo(7.5f, 9f); lineToRelative(4f, 4f); close()
        }
    }

    val WarningAmber: ImageVector by lazy {
        icon("WarningAmber") {
            moveTo(12f, 5.99f); lineTo(19.53f, 19f); horizontalLineTo(4.47f); close()
            moveTo(2.74f, 18f); curveToRelative(-0.77f, 1.33f, 0.19f, 3f, 1.73f, 3f)
            horizontalLineToRelative(15.06f); curveToRelative(1.54f, 0f, 2.5f, -1.67f, 1.73f, -3f)
            lineTo(13.73f, 4.99f); curveToRelative(-0.77f, -1.33f, -2.69f, -1.33f, -3.46f, 0f); close()
            moveTo(11f, 11f); verticalLineToRelative(2f); curveToRelative(0f, 0.55f, 0.45f, 1f, 1f, 1f)
            reflectiveCurveToRelative(1f, -0.45f, 1f, -1f); verticalLineToRelative(-2f)
            curveToRelative(0f, -0.55f, -0.45f, -1f, -1f, -1f); reflectiveCurveToRelative(-1f, 0.45f, -1f, 1f); close()
            moveTo(11f, 16f); horizontalLineToRelative(2f); verticalLineToRelative(2f); horizontalLineToRelative(-2f); close()
        }
    }

    private fun icon(
        name: String,
        autoMirror: Boolean = false,
        block: PathBuilder.() -> Unit,
    ): ImageVector = ImageVector.Builder(
        name = "OrchIcons.$name",
        defaultWidth = 24.dp,
        defaultHeight = 24.dp,
        viewportWidth = 24f,
        viewportHeight = 24f,
        autoMirror = autoMirror,
    ).apply {
        path(fill = SolidColor(Color.Black), pathBuilder = block)
    }.build()
}
