set obj = CreateObject("Scriptlet.TypeLib")  
WScript.StdOut.WriteLine Mid(obj.GUID, 2, 36)