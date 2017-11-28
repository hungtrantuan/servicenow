@ECHO OFF

PUSHD %~dp0

CSCRIPT //nologo EncodeBase64.vbs "%~1" "%~2"
