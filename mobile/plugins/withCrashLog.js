/**
 * Writes a crash report to the device's Downloads folder.
 *
 * This exists because the app dies during native startup, before any
 * JavaScript runs - so the error boundary in src/ never gets a chance, and the
 * only witness is Android's own log, which needs adb, which needs Developer
 * options, which a managed device may not offer at all. A file in Downloads is
 * something anyone can open and read without a cable or a computer.
 *
 * The handler is installed at the very top of onCreate, ahead of
 * super.onCreate(), because loadReactNative() - where React Native pulls in its
 * native libraries - runs inside it and is the most likely place to fail.
 *
 * This catches Java and Kotlin throwables, which is what most React Native
 * startup failures are (UnsatisfiedLinkError and friends). A pure native
 * segfault kills the process without unwinding and will not produce a file;
 * that absence is itself a useful answer, since it splits the remaining
 * possibilities cleanly in two.
 */

const { withMainApplication } = require('expo/config-plugins');

const MARKER = 'installCrashLogger';

// Fully-qualified names throughout: this is injected into a file whose imports
// are written by Expo's template and are not ours to extend.
const HANDLER = `
  // Injected by plugins/withCrashLog.js
  private fun installCrashLogger() {
    val previous = Thread.getDefaultUncaughtExceptionHandler()
    Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
      try {
        val sw = java.io.StringWriter()
        throwable.printStackTrace(java.io.PrintWriter(sw))
        val report = StringBuilder()
        report.append("Showcase crash report\\n")
        report.append("time    : ").append(java.util.Date().toString()).append("\\n")
        report.append("device  : ").append(android.os.Build.MANUFACTURER).append(" ").append(android.os.Build.MODEL).append("\\n")
        report.append("android : ").append(android.os.Build.VERSION.RELEASE).append(" (API ").append(android.os.Build.VERSION.SDK_INT).append(")\\n")
        report.append("abis    : ").append(android.os.Build.SUPPORTED_ABIS.joinToString(", ")).append("\\n")
        report.append("thread  : ").append(thread.name).append("\\n\\n")
        report.append(sw.toString())
        writeCrashReport(report.toString())
      } catch (ignored: Throwable) {
        // A crash reporter that crashes must not replace the crash it reports.
      }
      previous?.uncaughtException(thread, throwable)
    }
  }

  private fun writeCrashReport(text: String) {
    val stamp = java.text.SimpleDateFormat("yyyyMMdd-HHmmss", java.util.Locale.US).format(java.util.Date())
    val name = "showcase-crash-" + stamp + ".txt"
    // MediaStore is how an app writes somewhere the user can actually find it
    // without holding any storage permission.
    if (android.os.Build.VERSION.SDK_INT >= 29) {
      val values = android.content.ContentValues()
      values.put(android.provider.MediaStore.MediaColumns.DISPLAY_NAME, name)
      values.put(android.provider.MediaStore.MediaColumns.MIME_TYPE, "text/plain")
      values.put(android.provider.MediaStore.MediaColumns.RELATIVE_PATH, android.os.Environment.DIRECTORY_DOWNLOADS)
      val uri = contentResolver.insert(android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
      if (uri != null) {
        contentResolver.openOutputStream(uri)?.use { it.write(text.toByteArray()) }
        return
      }
    }
    // Older Android, or MediaStore refused: the app's own directory still beats
    // losing the report.
    java.io.File(getExternalFilesDir(null), name).writeText(text)
  }
`;

module.exports = function withCrashLog(config) {
  return withMainApplication(config, (mod) => {
    if (mod.modResults.language !== 'kt') {
      throw new Error(
        `withCrashLog: expected a Kotlin MainApplication, got ${mod.modResults.language}.`
      );
    }

    // prebuild without --clean re-runs mods over an already-generated project.
    if (mod.modResults.contents.includes(MARKER)) return mod;

    let contents = mod.modResults.contents;

    const onCreate = 'override fun onCreate() {\n    super.onCreate()';
    if (!contents.includes(onCreate)) {
      throw new Error(
        'withCrashLog: could not find `override fun onCreate() { super.onCreate()` in ' +
          'MainApplication.kt. The Expo template changed shape; this plugin needs updating.'
      );
    }
    contents = contents.replace(
      onCreate,
      'override fun onCreate() {\n    installCrashLogger()\n    super.onCreate()'
    );

    // Put the methods just before the class's closing brace, which is the last
    // one in the file.
    const end = contents.lastIndexOf('}');
    if (end === -1) {
      throw new Error('withCrashLog: MainApplication.kt has no closing brace.');
    }
    contents = contents.slice(0, end) + HANDLER + '\n' + contents.slice(end);

    mod.modResults.contents = contents;
    return mod;
  });
};
