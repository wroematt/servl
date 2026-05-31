package com.servl.app.ui.pets

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.patrykandpatrick.vico.compose.cartesian.CartesianChartHost
import com.patrykandpatrick.vico.compose.cartesian.axis.rememberBottom
import com.patrykandpatrick.vico.compose.cartesian.axis.rememberStart
import com.patrykandpatrick.vico.core.cartesian.axis.HorizontalAxis
import com.patrykandpatrick.vico.core.cartesian.axis.VerticalAxis
import com.patrykandpatrick.vico.compose.cartesian.layer.rememberColumnCartesianLayer
import com.patrykandpatrick.vico.compose.cartesian.rememberCartesianChart
import com.patrykandpatrick.vico.core.cartesian.data.CartesianChartModelProducer
import com.patrykandpatrick.vico.core.cartesian.data.columnSeries
import com.patrykandpatrick.vico.core.cartesian.data.CartesianValueFormatter
import com.servl.app.ui.theme.TextSecondary
import java.time.LocalDate
import java.time.format.DateTimeFormatter as JavaDateTimeFormatter

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PetStatsScreen(
    petId: String,
    onNavigateBack: () -> Unit,
    viewModel: PetViewModel = hiltViewModel(),
) {
    val stats by viewModel.stats.collectAsState()
    val modelProducer = remember { CartesianChartModelProducer() }

    // Short date labels for the chart x-axis: "5 Jan", "12 Jan", etc.
    val shortDateFmt = remember { JavaDateTimeFormatter.ofPattern("d MMM") }
    // Full display format for the list rows: "15 Jan 2024"
    val listDateFmt = remember { JavaDateTimeFormatter.ofPattern("d MMM yyyy") }

    // Derive date labels once per stats update.
    val dateLabels = remember(stats) {
        stats.map { day ->
            runCatching { LocalDate.parse(day.date).format(shortDateFmt) }.getOrDefault(day.date)
        }
    }

    val xAxisFormatter = remember(dateLabels) {
        CartesianValueFormatter { _, x, _ ->
            val i = x.toInt()
            if (i in dateLabels.indices) dateLabels[i] else ""
        }
    }

    LaunchedEffect(petId) { viewModel.loadStats(petId) }

    LaunchedEffect(stats) {
        if (stats.isNotEmpty()) {
            modelProducer.runTransaction {
                columnSeries { series(stats.map { it.total_g.toFloat() }) }
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Statistics (30 days)") },
                navigationIcon = { IconButton(onClick = onNavigateBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back") } },
            )
        },
    ) { padding ->
        LazyColumn(
            Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            item {
                if (stats.isEmpty()) {
                    Box(Modifier.fillMaxWidth().height(200.dp), contentAlignment = Alignment.Center) {
                        Text("No data for this period", color = TextSecondary)
                    }
                } else {
                    Card {
                        Column(Modifier.padding(16.dp)) {
                            Text("Daily intake (g)", style = MaterialTheme.typography.titleMedium)
                            Spacer(Modifier.height(12.dp))
                            CartesianChartHost(
                                chart = rememberCartesianChart(
                                    rememberColumnCartesianLayer(),
                                    startAxis = VerticalAxis.rememberStart(),
                                    bottomAxis = HorizontalAxis.rememberBottom(
                                        valueFormatter = xAxisFormatter,
                                        // Show at most one label per 7 data points to avoid crowding.
                                        itemPlacer = HorizontalAxis.ItemPlacer.aligned(spacing = { 7 }),
                                        labelRotationDegrees = -45f,
                                    ),
                                ),
                                modelProducer = modelProducer,
                                modifier = Modifier.fillMaxWidth().height(220.dp),
                            )
                        }
                    }
                }
            }

            item {
                // Summary row
                val total    = stats.sumOf { it.total_g }
                val avgDaily = if (stats.isNotEmpty()) total / stats.size else 0
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    StatCard("Total", "${total}g", Modifier.weight(1f))
                    StatCard("Daily avg", "${avgDaily}g", Modifier.weight(1f))
                    StatCard("Feeds", "${stats.sumOf { it.feed_count }}", Modifier.weight(1f))
                }
            }

            items(stats) { day ->
                // day.date is "2024-01-15" from the API (::text cast) — show as "15 Jan 2024"
                val displayDate = runCatching {
                    LocalDate.parse(day.date).format(listDateFmt)
                }.getOrDefault(day.date)

                ListItem(
                    headlineContent = { Text(displayDate) },
                    trailingContent = {
                        Column(horizontalAlignment = Alignment.End) {
                            Text("${day.total_g}g", style = MaterialTheme.typography.bodyMedium)
                            Text("${day.feed_count} feeds", style = MaterialTheme.typography.bodySmall, color = TextSecondary)
                        }
                    },
                )
                HorizontalDivider()
            }
        }
    }
}

@Composable
private fun StatCard(label: String, value: String, modifier: Modifier = Modifier) {
    Card(modifier = modifier) {
        Column(Modifier.padding(12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(value, style = MaterialTheme.typography.titleMedium)
            Text(label, style = MaterialTheme.typography.bodySmall, color = TextSecondary)
        }
    }
}
