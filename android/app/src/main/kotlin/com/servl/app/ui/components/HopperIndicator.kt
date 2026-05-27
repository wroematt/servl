package com.servl.app.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import com.servl.app.ui.theme.Danger
import com.servl.app.ui.theme.Success
import com.servl.app.ui.theme.Warning

/** Circular arc indicator showing hopper fill percentage. */
@Composable
fun HopperIndicator(pct: Int, modifier: Modifier = Modifier) {
    val color = when {
        pct > 50 -> Success
        pct > 20 -> Warning
        else     -> Danger
    }
    Canvas(modifier = modifier) {
        val strokeWidth = size.minDimension * 0.15f
        val inset = strokeWidth / 2
        drawArc(
            color = Color.LightGray,
            startAngle = -210f,
            sweepAngle = 240f,
            useCenter = false,
            topLeft = Offset(inset, inset),
            size = Size(size.width - strokeWidth, size.height - strokeWidth),
            style = androidx.compose.ui.graphics.drawscope.Stroke(width = strokeWidth, cap = androidx.compose.ui.graphics.StrokeCap.Round),
        )
        drawArc(
            color = color,
            startAngle = -210f,
            sweepAngle = 240f * (pct / 100f),
            useCenter = false,
            topLeft = Offset(inset, inset),
            size = Size(size.width - strokeWidth, size.height - strokeWidth),
            style = androidx.compose.ui.graphics.drawscope.Stroke(width = strokeWidth, cap = androidx.compose.ui.graphics.StrokeCap.Round),
        )
    }
}
