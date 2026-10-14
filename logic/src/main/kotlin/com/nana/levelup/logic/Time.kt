package com.nana.levelup.logic

import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import kotlin.random.Random

private val isoFormatter: DateTimeFormatter =
    DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(ZoneOffset.UTC)

fun iso(instant: Instant): String = isoFormatter.format(instant)

fun uid(prefix: String, now: Instant = Instant.now()): String {
    val alphabet = "0123456789abcdefghijklmnopqrstuvwxyz"
    val suffix = buildString(6) {
        repeat(6) { append(alphabet[Random.nextInt(alphabet.length)]) }
    }
    return "$prefix-${now.toEpochMilli()}-$suffix"
}
