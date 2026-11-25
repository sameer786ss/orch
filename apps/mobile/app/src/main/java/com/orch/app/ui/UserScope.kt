package com.orch.app.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelStore
import androidx.lifecycle.ViewModelStoreOwner

import com.orch.app.ui.chat.clearThumbnailCache

class UserScope : ViewModel(), ViewModelStoreOwner {
    override val viewModelStore = ViewModelStore()

    var autoSignIn = true

    fun reset() {
        clearThumbnailCache()
        viewModelStore.clear()
    }

    override fun onCleared() {
        clearThumbnailCache()
        viewModelStore.clear()
    }
}
