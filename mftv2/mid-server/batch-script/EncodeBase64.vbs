Option Explicit
' common consts
Const TypeBinary = 1
Const ForReading = 1, ForWriting = 2, ForAppending = 8
 
' getting file from args (no checks!)
Dim inByteArray, base64Encoded, base64Decoded, outByteArray

Main

Sub Main
   Dim fso, stdout, stderr

   Set fso = WScript.CreateObject("Scripting.FileSystemObject") 
   Set stdout = fso.GetStandardStream(1) 
   Set stderr = fso.GetStandardStream(2) 

   Dim Path
   
   Select Case WScript.Arguments.Count
      Case 2: Path = Replace(WScript.Arguments(0), "/", "\")
      Case Else: stderr.WriteLine "Invalid number of arguments.": Exit Sub
   End Select

   Dim arPath, Pattern
   arPath = Split(Path, "\")
   Pattern = arPath(UBound(arPath,1))
   arPath(UBound(arPath, 1)) = ""
   Path = Join(arPath, "\")

   If Path = "" Then 
      Path = ".\" 
   End If

   Pattern = Replace(Pattern, "_", "\_")
   Pattern = Replace(Pattern, ".", "\.")
   Pattern = Replace(Pattern, "*", ".*")
   
   Dim Folder
   Set Folder = fso.GetFolder(Path)
   Dim Files
   Set Files = Folder.Files
   Dim File
   For Each File In Files
      If RegExTest(Pattern, File.Name) Then
	 Dim Name
	 If Right(File.Name, 3) = ".gz" Then
		Name = Left(File.Name, Len(File.Name) - 3)

   		Dim oShell
   		Set oShell = WScript.CreateObject("WScript.Shell")
		oShell.Run "cmd /c gzip -df " + Chr(34) + Path & File.Name + Chr(34), 0, True
		Set oShell = Nothing
	 Else
		Name = File.Name
	 End If
	 inByteArray = readBytes(Path & Name)
         base64Encoded = encodeBase64(inByteArray)
         stdout.WriteLine "(" & Name & ")" 
         stdout.WriteLine base64Encoded

	 Dim SubDir
	 SubDir = WScript.Arguments(1)
	 If SubDir = "" Then SubDir = "."

	 Dim Archive
         Archive = ".\archive\" & SubDir & "\"

	 If Not fso.FolderExists(Archive) Then fso.CreateFolder Archive

	 If fso.FileExists(Archive & Name) Then
		fso.DeleteFile Archive & Name, True
	 End If

	 fso.MoveFile Path & Name, Archive
      End If
   Next

End Sub
 
private function readBytes(file)
  dim inStream
  ' ADODB stream object used
  set inStream = WScript.CreateObject("ADODB.Stream")
  ' open with no arguments makes the stream an empty container 
  inStream.Open
  inStream.type= TypeBinary
  inStream.LoadFromFile(file)
  readBytes = inStream.Read()
end function
 
private function encodeBase64(bytes)
  dim DM, EL
  Set DM = CreateObject("Microsoft.XMLDOM")
  ' Create temporary node with Base64 data type
  Set EL = DM.createElement("tmp")
  EL.DataType = "bin.base64"
  ' Set bytes, get encoded String
  EL.NodeTypedValue = bytes
  encodeBase64 = EL.Text
end function

Function RegExTest(pattern, strng)
   Dim regEx
   Set regEx = New RegExp   ' Create a regular expression.
   regEx.Pattern = pattern   ' Set pattern.
   regEx.IgnoreCase = True   ' Set case insensitivity.
   regEx.Global = True   ' Set global applicability.
   RegExTest = (regEx.Replace(strng, "") = "")
End Function