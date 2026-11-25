package com.orch.app

import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.remember
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.Coil
import coil.ImageLoader
import coil.decode.SvgDecoder
import com.google.firebase.Firebase
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.auth.auth
import com.orch.app.ui.OrchApp
import com.orch.app.ui.UserScope
import com.orch.app.ui.auth.AuthScreen
import com.orch.app.ui.theme.OrchTheme
import com.orch.app.update.UpdateDialog
import com.orch.app.update.UpdateViewModel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.receiveAsFlow

private fun FirebaseAuth.authState(): Flow<FirebaseUser?> = callbackFlow {
    val listener = FirebaseAuth.AuthStateListener { trySend(it.currentUser) }
    addAuthStateListener(listener)
    awaitClose { removeAuthStateListener(listener) }
}

class MainActivity : ComponentActivity() {
    private val deepLinks = Channel<Uri>(Channel.BUFFERED)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        dispatchOAuthUri(intent)
        Coil.setImageLoader {
            ImageLoader.Builder(applicationContext)
                .components { add(SvgDecoder.Factory()) }
                .build()
        }
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT)
        )
        setContent {
            OrchTheme {
                AppRoot(deepLinks = remember { deepLinks.receiveAsFlow() })
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        dispatchOAuthUri(intent)
    }

    private fun dispatchOAuthUri(intent: Intent?) {
        val uri = intent?.data ?: return
        if (uri.scheme.equals("orch", ignoreCase = true)) {
            deepLinks.trySend(uri)
        }
    }
}

@Composable
private fun AppRoot(
    deepLinks: Flow<Uri>,
    auth: FirebaseAuth = Firebase.auth
) {
    val userScope: UserScope = viewModel()
    val updates: UpdateViewModel = viewModel()
    val update by updates.dialog.collectAsStateWithLifecycle()
    LifecycleEventEffect(Lifecycle.Event.ON_START) { updates.check() }
    val authState = remember(auth) { auth.authState() }
    val user by authState.collectAsStateWithLifecycle(initialValue = auth.currentUser)
    val current = user
    if (current == null) {
        LaunchedEffect(Unit) { userScope.reset() }
        AuthScreen(
            autoPrompt = userScope.autoSignIn,
            onAuthSuccess = { userScope.autoSignIn = true }
        )
    } else {
        key(current.uid) {
            OrchApp(
                userScope = userScope,
                userId = current.uid,
                userName = current.displayName,
                userEmail = current.email,
                deepLinks = deepLinks
            )
        }
    }

    UpdateDialog(
        state = update,
        onRestart = updates::install,
        onRetry = updates::retry,
        onLater = updates::later
    )
}
