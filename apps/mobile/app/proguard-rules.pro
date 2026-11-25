# Preserve line numbers for readable crash stack traces
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# kotlinx.serialization generated serializers and @Serializable models
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt
-keepclassmembers class kotlinx.serialization.json.** {
    *** Companion;
}
-keepclasseswithmembers class kotlinx.serialization.json.** {
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class com.orch.app.**$$serializer { *; }
-keepclassmembers class com.orch.app.** {
    *** Companion;
}
-keepclasseswithmembers class com.orch.app.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# Retrofit service interfaces and generic signatures
-keepattributes Signature, Exceptions
-keep,allowobfuscation,allowshrinking interface retrofit2.Call
-keep,allowobfuscation,allowshrinking class retrofit2.Response
-keep,allowobfuscation,allowshrinking class kotlin.coroutines.Continuation

# Manifest-registered components
-keep class com.orch.app.OrchApplication { *; }
-keep class com.orch.app.update.UpdateInstallReceiver { *; }
