package com.orch.app.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.core.stringSetPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.map
import java.io.IOException

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore("orch_preferences")

class OrchPreferences(context: Context) {
    private val store = context.applicationContext.dataStore

    val modelId: Flow<String> = store.data
        .catch { if (it is IOException) emit(emptyPreferences()) else throw it }
        .map { it[MODEL].orEmpty() }

    val thinkingEffort: Flow<String?> = store.data
        .catch { if (it is IOException) emit(emptyPreferences()) else throw it }
        .map { it[THINKING_EFFORT] }

    val activeConnectors: Flow<Set<String>> = store.data
        .catch { if (it is IOException) emit(emptyPreferences()) else throw it }
        .map { it[ACTIVE_CONNECTORS] ?: emptySet() }

    val activeProjectId: Flow<String?> = store.data
        .catch { if (it is IOException) emit(emptyPreferences()) else throw it }
        .map { it[ACTIVE_PROJECT_ID]?.takeIf { value -> value.isNotBlank() } }

    suspend fun setModelId(id: String) {
        store.edit { it[MODEL] = id }
    }

    suspend fun setThinkingEffort(effort: String) {
        store.edit { it[THINKING_EFFORT] = effort }
    }

    suspend fun setActiveConnectors(connectors: Set<String>) {
        store.edit { it[ACTIVE_CONNECTORS] = connectors }
    }

    suspend fun setActiveProjectId(projectId: String?) {
        store.edit { prefs ->
            if (projectId.isNullOrBlank()) prefs.remove(ACTIVE_PROJECT_ID)
            else prefs[ACTIVE_PROJECT_ID] = projectId
        }
    }

    private companion object {
        val MODEL = stringPreferencesKey("default_model")
        val THINKING_EFFORT = stringPreferencesKey("thinking_effort")
        val ACTIVE_CONNECTORS = stringSetPreferencesKey("active_connectors")
        val ACTIVE_PROJECT_ID = stringPreferencesKey("active_project_id")
    }
}
