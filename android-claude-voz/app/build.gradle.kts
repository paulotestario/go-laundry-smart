plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.paulotestario.claudevoz"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.paulotestario.claudevoz"
        minSdk = 26
        // 34: evita o modo edge-to-edge obrigatório do Android 15.
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
    }

    buildTypes {
        release {
            // Sem minificação: o SDK da Anthropic usa reflexão (Jackson/Kotlin).
            isMinifyEnabled = false
            // Assinado com a chave de debug para poder instalar direto no celular.
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }

    packaging {
        resources {
            excludes += setOf(
                "META-INF/DEPENDENCIES",
                "META-INF/LICENSE*",
                "META-INF/NOTICE*",
                "META-INF/INDEX.LIST",
                "META-INF/*.kotlin_module",
                "META-INF/versions/**",
                "META-INF/FastDoubleParser-*",
                "META-INF/io.netty.versions.properties",
            )
        }
    }
}

dependencies {
    implementation("com.anthropic:anthropic-java:2.68.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("com.google.android.material:material:1.12.0")
}
