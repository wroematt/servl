package com.servl.app.ui.theme

import android.app.Activity
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

private val ServlColorScheme = lightColorScheme(
    primary          = Primary,
    onPrimary        = Surface,
    primaryContainer = PrimaryLight,
    onPrimaryContainer = TextPrimary,
    secondary        = Accent,
    onSecondary      = Surface,
    secondaryContainer = WarningLight,
    tertiary         = Muted,
    onTertiary       = TextPrimary,
    background       = Background,
    onBackground     = TextPrimary,
    surface          = Surface,
    onSurface        = TextPrimary,
    surfaceVariant   = Background,
    onSurfaceVariant = TextSecondary,
    outline          = BorderDefault,
    error            = Danger,
    onError          = Surface,
    errorContainer   = DangerLight,
    onErrorContainer = Danger,
)

@Composable
fun ServlTheme(content: @Composable () -> Unit) {
    // Servl always uses a light colour scheme. Force dark status-bar icons so
    // battery/signal indicators are visible regardless of the phone's dark-mode setting.
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = true
        }
    }

    MaterialTheme(
        colorScheme = ServlColorScheme,
        typography  = ServlTypography,
        content     = content,
    )
}
