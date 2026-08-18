/**
 * Lets the app receive Android's "Share" from anywhere else on the phone.
 *
 * The whole point of an entry here is a link, and until now the only way to
 * get one in was to find it in another app, copy it, come back, and paste —
 * which is exactly the errand a phone should be saving you. With this, Showcase
 * appears in the share sheet of YouTube, a browser, Spotify or anything else,
 * and the editor opens with the link already filled in.
 *
 * React Native's Linking only ever reads an intent's *data URI*; it has no idea
 * that ACTION_SEND exists or that the payload lives in EXTRA_TEXT. Rather than
 * add a native module and a bridge to carry that across, this rewrites the
 * incoming share into a `showcase://share?...` VIEW intent before React Native
 * looks at it. From there it is an ordinary deep link, which React Navigation's
 * own linking config already knows how to route — no new JavaScript API, and
 * one less moving part to keep working.
 */

const { withMainActivity } = require('expo/config-plugins');

const MARKER = 'rewriteShareIntent';

// Fully-qualified names throughout: this is injected into a file whose imports
// are Expo's to write, not ours to extend.
const METHOD = `
  // Injected by plugins/withShareIntent.js
  private fun rewriteShareIntent(source: android.content.Intent?) {
    if (source == null) return
    if (source.action != android.content.Intent.ACTION_SEND) return
    val shared = source.getStringExtra(android.content.Intent.EXTRA_TEXT) ?: return

    val builder = android.net.Uri.Builder().scheme("showcase").authority("share")

    // Shared text is rarely just a URL — apps tend to send "Look at this
    // <title> https://..." — so the link is picked out of it and whatever is
    // left over becomes a starting title instead of being thrown away.
    val matcher = android.util.Patterns.WEB_URL.matcher(shared)
    val url = if (matcher.find()) shared.substring(matcher.start(), matcher.end()) else null
    if (url != null) builder.appendQueryParameter("mediaUrl", url)

    val leftover = (if (url != null) shared.replace(url, "") else shared).trim()
    val title = source.getStringExtra(android.content.Intent.EXTRA_SUBJECT)
      ?: leftover.ifEmpty { null }
    if (title != null) builder.appendQueryParameter("title", title)

    source.action = android.content.Intent.ACTION_VIEW
    source.data = builder.build()
    setIntent(source)
  }

  override fun onNewIntent(intent: android.content.Intent) {
    // A share that arrives while the app is already open.
    rewriteShareIntent(intent)
    super.onNewIntent(intent)
  }
`;

module.exports = function withShareIntent(config) {
  return withMainActivity(config, (mod) => {
    if (mod.modResults.language !== 'kt') {
      throw new Error(
        `withShareIntent: expected a Kotlin MainActivity, got ${mod.modResults.language}.`
      );
    }

    // prebuild without --clean re-runs mods over an already-generated project.
    if (mod.modResults.contents.includes(MARKER)) return mod;

    let contents = mod.modResults.contents;

    // The rewrite has to happen before React Native reads the intent, which it
    // does during super.onCreate.
    const anchor = 'setTheme(R.style.AppTheme);';
    if (!contents.includes(anchor)) {
      throw new Error(
        'withShareIntent: could not find the setTheme call in MainActivity.kt. ' +
          'The Expo template changed shape; this plugin needs updating.'
      );
    }
    contents = contents.replace(anchor, `${anchor}\n    rewriteShareIntent(intent)`);

    const end = contents.lastIndexOf('}');
    if (end === -1) {
      throw new Error('withShareIntent: MainActivity.kt has no closing brace.');
    }
    contents = contents.slice(0, end) + METHOD + '\n' + contents.slice(end);

    mod.modResults.contents = contents;
    return mod;
  });
};
