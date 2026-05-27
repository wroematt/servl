package com.servl.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable

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
    MaterialTheme(
        colorScheme = ServlColorScheme,
        typography  = ServlTypography,
        content     = content,
    )
}
