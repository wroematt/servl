package com.servl.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.servl.app.ui.theme.*

@Composable
fun StatusChip(status: String) {
    val (bg, fg, label) = when (status) {
        "online", "confirmed"  -> Triple(SuccessLight, Success, status)
        "offline", "failed",
        "timeout", "error"     -> Triple(DangerLight, Danger, status)
        "pending"              -> Triple(WarningLight, Warning, "pending")
        "owner"                -> Triple(PrimaryLight, Primary, "owner")
        "member"               -> Triple(BorderDefault, TextSecondary, "member")
        else                   -> Triple(BorderDefault, TextSecondary, status)
    }
    Text(
        text = label,
        color = fg,
        style = MaterialTheme.typography.labelSmall,
        fontWeight = FontWeight.Medium,
        modifier = Modifier
            .background(color = bg, shape = RoundedCornerShape(4.dp))
            .padding(horizontal = 6.dp, vertical = 2.dp),
    )
}
