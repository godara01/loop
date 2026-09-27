package expo.modules.smsreader

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.provider.Telephony
import androidx.core.content.ContextCompat
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Transaction SMS for Loop. See docs/12-sms-ingest.md.
 *
 * This layer only moves messages: it never parses, stores or logs a body.
 * Parsing happens in packages/shared, where it is unit-tested, and the raw
 * text is dropped as soon as it is parsed. Permission prompts are made from
 * JS (PermissionsAndroid) so the timing stays under the app's control.
 */
class SmsReaderModule : Module() {
  private var receiver: BroadcastReceiver? = null

  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("SmsReader")

    Events("onSms")

    /** Inbox messages received in the last `sinceDays` days, newest first. */
    AsyncFunction("getRecentSms") { sinceDays: Int ->
      val since = System.currentTimeMillis() - sinceDays.coerceIn(0, 365) * 86_400_000L
      val messages = mutableListOf<Map<String, Any>>()
      context.contentResolver.query(
        Telephony.Sms.Inbox.CONTENT_URI,
        arrayOf(Telephony.Sms.ADDRESS, Telephony.Sms.BODY, Telephony.Sms.DATE),
        "${Telephony.Sms.DATE} >= ?",
        arrayOf(since.toString()),
        "${Telephony.Sms.DATE} DESC"
      )?.use { cursor ->
        val address = cursor.getColumnIndexOrThrow(Telephony.Sms.ADDRESS)
        val body = cursor.getColumnIndexOrThrow(Telephony.Sms.BODY)
        val date = cursor.getColumnIndexOrThrow(Telephony.Sms.DATE)
        while (cursor.moveToNext()) {
          messages.add(
            mapOf(
              "sender" to (cursor.getString(address) ?: ""),
              "body" to (cursor.getString(body) ?: ""),
              "timestamp" to cursor.getLong(date).toDouble()
            )
          )
        }
      }
      messages
    }

    /** Starts forwarding each incoming SMS to JS as an `onSms` event. Idempotent. */
    Function("startListening") {
      startListening()
    }

    /** Stops forwarding. Safe to call when not listening. */
    Function("stopListening") {
      stop()
    }

    OnDestroy {
      stop()
    }
  }

  private fun startListening() {
    if (receiver != null) return
    val next = object : BroadcastReceiver() {
      override fun onReceive(ctx: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
        // One SMS longer than a PDU arrives as several parts from one sender.
        Telephony.Sms.Intents.getMessagesFromIntent(intent)
          .filterNotNull()
          .groupBy { it.originatingAddress ?: "" }
          .forEach { (sender, parts) ->
            sendEvent(
              "onSms",
              mapOf(
                "sender" to sender,
                "body" to parts.joinToString("") { it.messageBody ?: "" },
                "timestamp" to parts.first().timestampMillis.toDouble()
              )
            )
          }
      }
    }
    // Guarded by BROADCAST_SMS: only the system can deliver to this receiver,
    // so no other app can inject a fake bank message.
    ContextCompat.registerReceiver(
      context,
      next,
      IntentFilter(Telephony.Sms.Intents.SMS_RECEIVED_ACTION),
      Manifest.permission.BROADCAST_SMS,
      null,
      ContextCompat.RECEIVER_EXPORTED
    )
    receiver = next
  }

  private fun stop() {
    val current = receiver ?: return
    receiver = null
    try {
      appContext.reactContext?.unregisterReceiver(current)
    } catch (_: IllegalArgumentException) {
      // Already unregistered.
    }
  }
}
