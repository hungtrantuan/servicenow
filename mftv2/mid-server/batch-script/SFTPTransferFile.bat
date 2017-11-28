@echo off

rem SFTPTransferFile.bat -u <username@hostname> -pk <private_keyfile> -r <remote_folder> -p <public_host_key> -a <account_code> -f <filename> -d <inbound|outbound>
rem
rem Example:
rem -f <file name>			= -f "flexera_assets.txt"
rem -pk <private key file>	= -pk "my_private_key.ppk"
rem -u <ftp user @ host>	= -u "testuser@jitdcs6.csc.com"
rem -r <remote folder>		= -r "Incoming"
rem -p <host key>			= -p "a5:15:33:14:5c:be:22:96:5e:36:bb:c9:69:88:4b:a3"
rem -a <account_code>		= -a CSCi
rem -d <direction>			= -d inbound
rem -z

rem Change to current folder of batch script
pushd %~dp0
SetLocal EnableDelayedExpansion

rem Initialize default values
set -u=
set -pk=
set -r=
set -p=
set -a=
set -f=
set -d=
set nome=
set -z=no
set scriptName=%~n0
set tempdir=

rem Parsing input parameter(s)
rem for /f "tokens=1,2 delims=:" %%a in ("%foo%") do set name=%%a & set val=%%b
:initial
if [%1]==[] goto main

set aux=%~1
if "%aux:~0,1%"=="-" (
	if not [%nome%]==[] (
		if not "%nome%"=="-z" (
			echo Missing value of parameter [%nome%] 1>&2
			goto error
		)
		rem Set option -z=yes
		set "%nome%=yes"
	)
	set nome=%aux:~0,250%
) else (
	set "%nome%=%1"
	if "%nome%"=="-f" (
		if "%-z%"=="yes" (
			rem Build name of zip file
			set zipName=%~n1%~x1.gz
		)
		rem Extract filename, path, and absolutepath of input file
		set Name=%~n1%~x1
		set Folder=%~d1%~p1
		set Abspath=%~1
	)
	set nome=
)
shift
goto initial

:main
rem Validation required parameter(s)
if "%-u%"=="" (
	rem Write error message
	echo Missing required parameter [-u] 1>&2
	goto error
)
if [%-f%]==[] (
	rem Write error message
	echo Missing required parameter [-f] 1>&2
	goto error
)
if [%-r%]==[] (
	rem Write error message
	echo Missing required parameter [-r] 1>&2
	goto error
)
if [%-d%]==[] (
	rem Write error message
	echo Missing required parameter [-d] 1>&2
	goto error
)
if [%-a%]==[] (
	rem Write error message
	echo Missing required parameter [-a] 1>&2
	goto error
)

rem Set sub-folder = [account code]
set subFolder=%-a%

rem Branch processing by direction
if "%-d%"=="inbound" (
	SetLocal EnableDelayedExpansion
	
	rem Make a unique temporary folder for temporary files
	:getfolder
	for /f "delims=" %%A in ('CSCRIPT //nologo uuidGen.vbs') do set "uid=%%A"
	rem set uid=!time:~3,2!!time:~6,2!!time:~9,2!
	set tempdir=%scriptName%_!uid!
	mkdir "!tempdir!" 2>NUL
	if ERRORLEVEL 1 (
	  ping 127.0.0.1 -n1 -w 100 >NUL
	  goto getfolder
	)
	
	rem Build temporary file to contain error message(s)
	set errorname=!tempdir!\temp.err
	rem echo '' > %errorname%
	set Filename=!Name!
	
	rem Call psftp command with suplied batch file
	call _SFTPCmdsIn.cmd "%-r%" "!Filename!" "%Folder%" | psftp.exe -batch -hostkey "%-p%" -be -i "%-pk%" "%-u%" 2>"!errorname!" 1>NUL

	if ERRORLEVEL 1 (
		rem Send error content to stdout
		type "!errorname!" 1>&2
	) else (
		call _ReadFile.bat "%-f%" "%-a%"
	)

	rem Release the temporary folder
	rmdir /s /q "!tempdir!"
) else (
	SetLocal EnableDelayedExpansion
	
	rem Procesc outbound transfering
	rem Zip output file
	if "%-z%"=="yes" (
		gzip -f "%-f%"
		rem Check for error
		if ERRORLEVEL 1 goto error
		rem Update name of output file
		set Filename=%zipName%
	) else (
		set Filename=%Name%
	)
	rem echo !Filename!
	set FilePath=%Folder%!Filename!
	rem echo !FilePath!
		
	rem Call psftp command with suplied batch file
	call _SFTPCmdsOut.cmd "%-r%" "!Filename!" "%Folder%" | psftp.exe -batch -hostkey "%-p%" -be -i "%-pk%" "%-u%" 2>"!FilePath!.err"
	
	if ERRORLEVEL 1 (
		rem Move error file to 'notsent' folder
		mkdir ".\notsent\%subFolder%" 2>NUL
		move "!FilePath!" ".\notsent\%subFolder%" 1>NUL
		type "!FilePath!.err" 1>&2
	) else (
		rem Move sent file to 'archive' folder
		mkdir ".\archive\%subFolder%" 2>NUL
		move "!FilePath!" ".\archive\%subFolder%"
		if exist "!FilePath!.err" (del "!FilePath!.err")
	)
)

rem Remove old file(s) that created > 60 days in both 'notsent' and 'archive' folder
forfiles -p ".\notsent\%subFolder%" -s -m *.* /D -60 /C "cmd /c del @path" >nul 2>&1
forfiles -p ".\archive\%subFolder%" -s -m *.*  /D -60 /C "cmd /c del @path" >nul 2>&1

:end
exit /b %ERRORLEVEL%

:error
exit /b 1
