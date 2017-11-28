@echo off

rem 1. <remote directory>
rem 2. <file name>
rem 3. <local directory>

echo cd "%~1"
echo lcd "%~3"
echo mget "%~2"
