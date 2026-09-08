Option Explicit

Dim shell, fso, projectDir, pythonCommand
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

projectDir = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = projectDir
pythonCommand = "pythonw.exe """ & projectDir & "\server.py"""

shell.Run pythonCommand, 0, False
WScript.Sleep 1200
shell.Run "http://localhost:8088", 1, False

Set fso = Nothing
Set shell = Nothing