import React from 'react'
import { FileIcon as ReactFileIcon, defaultStyles } from 'react-file-icon'

interface FileIconProps {
  filename: string
  isDir?: boolean
  isOpen?: boolean
  size?: number
}

export const FileIcon: React.FC<FileIconProps> = ({ filename, isDir, isOpen, size = 16 }) => {
  if (isDir) {
    // Folder icon using CSS
    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        fontSize: size,
      }}>
        {isOpen ? '📂' : '📁'}
      </span>
    )
  }

  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  const style = (defaultStyles as any)[ext] ?? {}

  return (
    <span style={{ display: 'inline-flex', width: size, height: size, flexShrink: 0 }}>
      <ReactFileIcon extension={ext} {...style} size={size} />
    </span>
  )
}
