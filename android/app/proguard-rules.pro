# The web page talks to the app over androidx.webkit's WebMessageListener,
# which is a plain postMessage channel rather than a reflected @JavascriptInterface
# bridge, so there is nothing R8 has to be told to keep for it. These rules
# exist so the release build has a file to point `proguardFiles` at.
-keepattributes SourceFile,LineNumberTable
