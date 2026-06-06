package com.servl.app.ui.components

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathFillType
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.unit.dp

/**
 * Single-colour pet-food-bowl ImageVector.
 *
 * Designed on a 24×24 viewport.  The bowl has a concave opening at the top
 * (viewed slightly from above) with three kibble-dot punch-holes inside.
 * As a single-colour vector it is tinted correctly by the Material Icon composable
 * just like any built-in Material icon.
 */
val PetBowlIcon: ImageVector by lazy {
    ImageVector.Builder(
        name = "PetBowl",
        defaultWidth = 24.dp,
        defaultHeight = 24.dp,
        viewportWidth = 24f,
        viewportHeight = 24f,
    ).apply {
        path(
            fill = SolidColor(Color.Black),
            pathFillType = PathFillType.EvenOdd,
        ) {
            // ── Bowl silhouette ────────────────────────────────────────────
            // Top rim: concave curve from left corner (2.5,5) dipping to
            // y≈6.25 at centre (shows bowl opening), back up to right corner.
            moveTo(2.5f, 5f)
            quadTo(12f, 7.5f, 21.5f, 5f)
            // Right wall down to rounded bottom-right corner
            lineTo(20f, 19.5f)
            quadTo(20f, 21f, 18.5f, 21f)
            // Flat base
            horizontalLineTo(5.5f)
            // Rounded bottom-left corner and left wall back up to start
            quadTo(4f, 21f, 4f, 19.5f)
            lineTo(2.5f, 5f)
            close()

            // ── Kibble dots (evenOdd = transparent punch-holes) ────────────
            // Left kibble  – centre (9, 15.5), radius 1.2
            moveTo(7.8f, 15.5f)
            arcTo(1.2f, 1.2f, 0f, isMoreThanHalf = true, isPositiveArc = false, 10.2f, 15.5f)
            arcTo(1.2f, 1.2f, 0f, isMoreThanHalf = true, isPositiveArc = false, 7.8f, 15.5f)
            close()
            // Centre kibble – centre (12, 13.5), radius 1.2
            moveTo(10.8f, 13.5f)
            arcTo(1.2f, 1.2f, 0f, isMoreThanHalf = true, isPositiveArc = false, 13.2f, 13.5f)
            arcTo(1.2f, 1.2f, 0f, isMoreThanHalf = true, isPositiveArc = false, 10.8f, 13.5f)
            close()
            // Right kibble – centre (15, 15.5), radius 1.2
            moveTo(13.8f, 15.5f)
            arcTo(1.2f, 1.2f, 0f, isMoreThanHalf = true, isPositiveArc = false, 16.2f, 15.5f)
            arcTo(1.2f, 1.2f, 0f, isMoreThanHalf = true, isPositiveArc = false, 13.8f, 15.5f)
            close()
        }
    }.build()
}
