package com.servl.app.ui.components

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Cookie
import androidx.compose.material.icons.filled.Tune
import androidx.compose.ui.graphics.vector.ImageVector

/** Returns the canonical icon for a feed type string ("meal", "snack", "custom"). */
fun feedTypeIcon(feedType: String): ImageVector = when (feedType) {
    "meal"  -> PetBowlIcon
    "snack" -> Icons.Default.Cookie
    else    -> Icons.Default.Tune   // custom / unknown
}
