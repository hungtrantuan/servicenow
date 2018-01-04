var MFTV2MIDServer = Class.create();
MFTV2MIDServer.prototype = {
	DEFAULT_PAGE_LIMIT: 5000, // Limit to be applied on pagination
	DEFAULT_DELIMITER_CHAR: ',',
	
	/**
	* Constructor
	*/
	initialize: function() {
        this._logMsg("Start initialize()");
		
		// Initializing Java packages
		this.HttpHost					= Packages.org.apache.http.HttpHost;
		this.AuthScope					= Packages.org.apache.http.auth.AuthScope;
		this.UsernamePwdCredentials		= Packages.org.apache.http.auth.UsernamePasswordCredentials;
		this.HttpGet					= Packages.org.apache.http.client.methods.HttpGet;
		this.BasicCredentialsProvider	= Packages.org.apache.http.impl.client.BasicCredentialsProvider;
		this.HttpClients				= Packages.org.apache.http.impl.client.HttpClients;
		this.EntityUtils				= Packages.org.apache.http.util.EntityUtils;
		this.IOUtils					= Packages.org.apache.commons.io.IOUtils;
		this.URI						= Packages.java.net.URI;
		this.File						= Packages.java.io.File;
		this.FileInputStream			= Packages.java.io.FileInputStream;
		this.FileOutputStream			= Packages.java.io.FileOutputStream;
		this.UUID						= Packages.java.util.UUID;
		this.Files						= Packages.java.nio.file.Files;
		this.Paths						= Packages.java.nio.file.Paths;
		this.StringReader				= Packages.java.io.StringReader;
		this.InputSource				= Packages.org.xml.sax.InputSource;
		this.DocumentBuilderFactory		= Packages.javax.xml.parsers.DocumentBuilderFactory;
		
		// Configuration settings
		this.domainName		= this._getInstanceBaseURL(ms.getConfigParameter('url'));
		this.exportUsername	= ms.getConfigParameter('mid.instance.username');
		this.exportPwd		= ms.getConfigParameter('mid.instance.password');
		
		// Set default debug mode = false
		this.debug = false;
		
		// Merging flag
		this.isMerge = false;
		
		this._logMsg("Finished initialize()");
    },
	
	/*
	* Method to get httpclient object (based on Apache HttpClient 4.3)
	* @returns {object}
	*/
	_getHttpClient43: function () {
		this._logMsg('Start _getHttpClient43()', 'debug');
		
		var uri = this.URI.create(ms.getConfigParameter('url'));
		var credsProvider = new this.BasicCredentialsProvider();
		var httpHost = new this.HttpHost(uri.getHost());
		var authScope = new this.AuthScope(httpHost);
		var usrnamePwdCreds = new this.UsernamePwdCredentials(this.exportUsername, this.exportPwd);
		credsProvider.setCredentials(authScope, usrnamePwdCreds);
		
		var httpClient = null;
		try {
			httpClient = this.HttpClients.custom().setDefaultCredentialsProvider(credsProvider).build();
		} catch (e) {
			this._logMsg('Error: ' + e);
		} finally {
		}
		
		this._logMsg('Finished _getHttpClient43()', 'debug');
		return httpClient;
	},
	
	/**
	 * Download file's content from ServiceNow instance in chunks and write its content to specified file.
	 */
	saveFile2MIDServer: function() {
		this._logMsg('Start saveFile2MIDServer()');
		
		var ret = true;
		// Get input parameters from SNOW
		this.probeParams = this._getJSProbe();
		var validation = this._validateInputParameters(this.probeParams);
		if (!validation.status) {
			probe.createElement('status', 'error');
			probe.createElement('status_message', validation.status_message);
			ret = false;
		} else {
			// Validate value of pageLimit
			var nLimit = parseInt(this.probeParams.pageLimit, 10);
			if (nLimit > 0 && nLimit < this.DEFAULT_PAGE_LIMIT) {
				this.page_limit = nLimit;
			} else {
				this.page_limit = this.DEFAULT_PAGE_LIMIT;
			}
			
			this.debug = this.probeParams.debugMode;
			
			var nPartNumber  = parseInt(this.probeParams.partNumber, 10);
			var nHeaderLines = parseInt(this.probeParams.headerLines, 10);
			var nTotalRow    = parseInt(this.probeParams.totalRow, 10);
			var nTotalPart   = parseInt(this.probeParams.totalPart, 10);
			var fieldArr     = this.probeParams.returnFields.split('%2c');
			
			// Build suffix if total part > 1
			var suffix = '';
			if (nTotalPart > 1) {
				suffix = '.part' + this._formatNumber(nPartNumber, '', '00', 0) + '-' + this._formatNumber(nTotalPart, '', '00', 0);
			}
			var outputFile = this.probeParams.filePath + '/' + this.probeParams.fileName + suffix;
			var uuid = this.UUID.randomUUID();
			var tempName = this.probeParams.filePath + '/' + '__downloading_' + this.probeParams.fileName + '.' + uuid.toString();
			
			var out = null;
			var httpClient = null;
			var status = 'success';
			var status_message = '';
			try {
				// Set up the HTTP Connection
				httpClient = this._getHttpClient43();
				if (httpClient) {
					// Prepare temporary file to store downloaded data
					var f = new this.File(tempName);
					
					// Initialize HTTP GET
					var httpGet = new this.HttpGet();
					var offset = 0;
					if (nPartNumber > 1) {
						offset = nHeaderLines; // Skip N line(s) of header
					}
					
					var downloaded = false;
					for (; ; offset += this.page_limit) {
						// Build request URL using REST Table API
						/*
						var url = '';
						url += this.domainName;
						url += 'api/now/table/';
						url += this.probeParams.tableName;
						url += '?sysparm_query=' + this.probeParams.queryString;
						url += '&sysparm_fields=' + this.probeParams.returnFields;
						url += '&sysparm_limit=' + this.page_limit;
						url += '&sysparm_offset=' + offset;
						*/
						var url = this.domainName + this.probeParams.urlREST + '&sysparm_limit=' + this.page_limit + '&sysparm_offset=' + offset;
						
						this._logMsg("URL: " + url, 'debug');
						
						// Add URL for HTTP GET
						httpGet.setURI(this.URI.create(url));
						httpGet.setHeader("Accept", "application/xml");
						
						var response = null;
						var inputStream = null;
						try {
							// Execute HTTP GET
							response = httpClient.execute(httpGet);
							var statusLine = response.getStatusLine().toString();
							var responseBody = this.EntityUtils.toString(response.getEntity());
							this._logMsg('statusLine=' + statusLine, 'debug');
							this._logMsg('responseBody=' + responseBody, 'debug');
							//responseBody=<?xml version="1.0" encoding="UTF-8"?><response><error><detail>...</detail><message>...</message></error><status>failure</status></response> 
							//responseBody=<?xml version="1.0" encoding="UTF-8"?><response><result>...</result></response>
							
							// Prepare the XML parser
							var parser = this.DocumentBuilderFactory.newInstance().newDocumentBuilder();
							var inputSource = new this.InputSource();
							inputSource.setCharacterStream(new this.StringReader(responseBody));
							
							// Parse XML content
							var xmlDoc = parser.parse(inputSource);
								
							// Check status code
							if (statusLine.indexOf('200') > 0) {
								var nList = xmlDoc.getElementsByTagName("result");
								var nStatus = xmlDoc.getElementsByTagName("status");
								if (nStatus.getLength() > 0) {
									// Some error detected
									var nError = xmlDoc.getElementsByTagName('error');
									var nDetail = nError.item(0).getElementsByTagName('detail');
									status_message = nDetail.item(0).getTextContent();
									status = (downloaded)?'warn':'error';
									
									// Stop accessing SNOW
									break;
								} else {
									// No error detected
									var rowData = [];
									for (var i = 0; i < nList.getLength(); i++) {
										var fieldData = [];
										for (var j = 0; j < fieldArr.length; j++) {
											var fName = fieldArr[j];
											var node = nList.item(i).getElementsByTagName(fName);
											var fVal = node.item(0).getTextContent();
											fieldData.push(fVal);
										}
										rowData.push(fieldData.join(this.probeParams.delimiter));
									}
									
									// Write data to input stream
									if (rowData.length > 0) {
										// Write downloaded row(s) into input stream
										inputStream = this.IOUtils.toInputStream(rowData.join('\n') + '\n');
									} else {
										// Write empty row into input stream
										inputStream = this.IOUtils.toInputStream('');
									}
																	
									// Check whether file is opened
									if (out == null) {
										// Open file to append data
										out = new this.FileOutputStream(f, true);
									}
									
									// Write input stream data to file
									this.IOUtils.copy(inputStream, out);
									downloaded = true;
									
									// Check for next round: Stop downloading data if returned row < page_limit OR returned row = 0
									if (rowData.length == 0 || rowData.length < this.page_limit) {
										break;
									}
								}
							} else {
								var nStatus1 = xmlDoc.getElementsByTagName("status");
								if (nStatus1.getLength() > 0) {
									// Some error detected
									var nError1 = xmlDoc.getElementsByTagName('error');
									var nDetail1 = nError1.item(0).getElementsByTagName('detail');
									status_message = nDetail1.item(0).getTextContent();
								}
								status = (downloaded)?'warn':'error';
								
								// Stop accessing SNOW
								break;
							}
						} catch (e) {
							status = 'error';
							status_message = 'Exception: ' + e;
							this._logMsg(status_message, 'error');
							break; // end loop
						} finally {
							if (inputStream != null) {
								this.IOUtils.closeQuietly(inputStream);
							}
							if (response != null) {
								response.close();
							}
						}
					}
				} else {
					status = 'error';
					status_message = 'Failed to open HttpClient connection';
				}
			} catch (err) {
				status = 'error';
				status_message = 'Exception: ' + err;
				this._logMsg(status_message, 'error');
			} finally {
				if (out != null) {
					out.flush();
					out.close();
				}
				if (httpClient != null) {
					httpClient.close();
				}
			}
			
			// Rename temporary-file to output-file
			if (status != 'error') {
				var src = new this.File(tempName);
				var dst = new this.File(outputFile);
				if (src.renameTo(dst)) {
					status_message = 'Completed saving file [' + outputFile +']' + ((status == 'warn')?('(' + status_message + ')'):'');
					this._logMsg(status_message);
					this.savedFile = outputFile;
				} else {
					status = 'error';
					status_message = 'File [' + outputFile + '] is already exist';
					this._logMsg(status_message, 'error');
					
					// Delete temporary file
					try {
						if (this.Files.deleteIfExists(src.toPath())) {
							this._logMsg('Deleted file: ' + tempName, 'debug');
						} else {
							this._logMsg("Couldn't deleted file: " + tempName, 'error');
						}
					} catch (e1) {
						this._logMsg('Error when deleting file: ' + e1, 'error');
					}
				}
			}
			
			// Build response message
			if (status == 'error' || !this.isMerge) {
				probe.createElement('status', status);
				probe.createElement('status_message', status_message);
			}
			
			ret = (status != 'error');
		}
		
		this._logMsg('Finished saveFile2MIDServer()');
		return ret;
    },
	
	/**
	* Validate input parameter(s)
	* @param params
	* @return {Object}
	*/
	_validateInputParameters: function(params) {
		this._logMsg('Start _validateInputParameters()', 'debug');
		
		var result = {status:true, status_message:''};
		
		// Validate required parameters
		if (params.filePath == null || params.filePath == '') {
			result.status = false;
			result.status_message = 'Required parameter [midFolder] was not supplied';
			return result;
		} else {
			if (!this.Files.isDirectory(this.Paths.get(params.filePath))) {
				result.status = false;
				result.status_message = 'Supplied value [midFolder='+params.filePath+'] is neither folder (directory) nor existing';
				return result;
			}
		}
		
		if (params.fileName == null || params.fileName == '') {
			result.status = false;
			result.status_message = 'Required parameter [fileName] was not supplied';
			return result;
		}
		
		/*
		if (params.tableName == null || params.tableName == '') {
			result.status = false;
			result.status_message = 'Required parameter [tableName] was not supplied';
			return result;
		}
		*/
		
		if (params.urlREST == null || params.urlREST == '') {
			result.status = false;
			result.status_message = 'Required parameter [urlREST] was not supplied';
			return result;
		}
		
		this._logMsg('Finished _validateInputParameters()', 'debug');
		return result;
	},
	
	
	/**
	 * Download file's content from ServiceNow instance then merge it to final file.
	 */
	saveFile2MIDServerNMerge: function() {
		this._logMsg('Start saveFile2MIDServerNMerge()');
		
		// Save file to MID server
		this.isMerge = true;
		var result = this.saveFile2MIDServer();
		
		// Check if file is saved successfully to MID server
		if (result) {
			var status = 'success';
			var status_message = 'Completed saving file [' + this.savedFile +']';
			
			// Check whether this file is a part of a big file
			var nTotalPart = parseInt(this.probeParams.totalPart, 10);
			if (nTotalPart > 1) {
				// List all files that have same prefix (name)
				var fileList = this._getFileList(this.probeParams.filePath, this.probeParams.fileName);
				if (fileList.length == nTotalPart) {
					// All parts are already downloaded. Merge files of 1 batch into 1 single file
					var mergedRes = this._mergeFiles(this.probeParams.filePath, this.probeParams.fileName, fileList);
					//this._logMsg('Merging result=' + JSON.stringify(mergedRes), 'debug');
					if (mergedRes.status) {
						// Send flag = true to allow a post-process command to be executed
						probe.createElement('last_part', 'true');
						status_message = mergedRes.status_message;
					} else {
						// Files are not merged by this request as they may be merged by other request in same batch
						// Send flag = false to NOT allow a post-process command to be executed
						probe.createElement('last_part', 'false');
						status_message = mergedRes.status_message;
					}
				} else {
					// Send flag = false: NOT to execute post process command
					probe.createElement('last_part', 'false');
				}
			} else {
				// This file is not a part of any file. Send flag = true to allow a post-process command to be executed
				probe.createElement('last_part', 'true');
			}
			
			// Build response message
			probe.createElement('status', status);
			probe.createElement('status_message', status_message);
		}
		
		this._logMsg('Finished saveFile2MIDServerNMerge()');
    },
	
	/**
	* List all files that have same prefix under given folder.
	* @param path
	* @param prefix
	* @private
	*/
	_getFileList: function(path, prefix) {
		this._logMsg('Start _getListFile()', 'debug');
		var result = [];
		
		// List all file in specified folder / directory
		var folder = new this.File(path);
		var files = folder.listFiles();
		
		// Go through list of retrieved file(s) to check
		for (var i = 0; i < files.length; i++) {
			var fileName = files[i].getName();
			if (files[i].isFile()) {
				if (fileName.startsWith(prefix)) {
					this._logMsg('fileName=' + fileName, 'debug');
					result.push(fileName);
				}
			}
		}
		this._logMsg('Finished _getListFile()', 'debug');
		return result.sort();
	},
	
	/**
	* List all files that have same prefix under given folder.
	* @param path
	* @param prefix
	* @private
	*/
	_mergeFiles: function(path, outputFile, fileList) {
		this._logMsg('Start _mergeFiles()', 'debug');
		
		var result = {status:true, status_message:''};
		
		// Build temporary filename
		var mergedFilename = path + '/' + outputFile;
		var uuid = this.UUID.randomUUID();
		var tempName = path + '/' + '__merging_' + outputFile + '.' + uuid.toString();
		
		var out = null;
		var inputStream = null;
		try {
			var oFile = new this.File(tempName);
			out = new this.FileOutputStream(oFile, true); // Open output file to append
			
			// Loop thought all files in list
			for (var i = 0; i < fileList.length; i++) {
				var inputFilename = path + '/' + fileList[i];
				var iFile = new this.File(inputFilename);
				if (iFile.length() == 0) continue; // Skipt merging empty file
				
				// Copy data from input file to output file
				inputStream = new this.FileInputStream(iFile);
				this.IOUtils.copy(inputStream, out);
			}
		} catch (e) {
			this._logMsg('Error when merging file: ' + e, 'error');
			result.status = false;
			result.status_message = 'Error when merging file: ' + e;
		} finally {
			if (inputStream != null) {
				this.IOUtils.closeQuietly(inputStream);
			}
			if (out != null) {
				this.IOUtils.closeQuietly(out);
			}
			
			if (result.status) {
				// Rename temporary file
				var src = new this.File(tempName);
				var dst = new this.File(mergedFilename);
				if (!src.renameTo(dst)) {
					// Destination file is already existed
					result.status = false;
					result.status_message = 'File [' + mergedFilename + '] is already exist';
					try {
						// Remove temporary file (if it's still there)
						if (this.Files.deleteIfExists(src.toPath())) {
							this._logMsg('Deleted file: ' + tempName, 'debug');
						} else {
							this._logMsg("Couldn't deleted file: " + tempName, 'error');
						}
					} catch (e1) {
						this._logMsg('Error when deleting file: ' + e1, 'error');
					}
				} else {
					result.status = true;
					result.status_message = 'Completed merging file [' + mergedFilename + ']';
					
					// Remove partial file(s) after merging
					this._logMsg('Remove partial file(s)...', 'debug');
					for (var j = 0; j < fileList.length; j++) {
						try {
							var fileName = path + '/' + fileList[j];
							var pFile = new this.File(fileName);
							if (this.Files.deleteIfExists(pFile.toPath())) {
								this._logMsg('Deleted file: ' + fileName, 'debug');
							} else {
								this._logMsg("Couldn't deleted file: " + fileName, 'error');
							}
						} catch (e2) {
							this._logMsg('Error when deleting file: ' + e2, 'error');
						}
					}
				}
			}
		}
		
		this._logMsg('Finished _mergeFiles()', 'debug');
		return result;
	},
	
	/**
	* Retrieve parameters sent from SNOW to MID server
	* @private
	*/
	_getJSProbe: function() {
		this._logMsg("Start _getJSProbe()");
		
		// Call _getJSProbe method from parent class
		var params = {};
        
		// Required parameters
		params.filePath			= probe.getParameter("midFolder");
		params.fileName			= probe.getParameter("fileName");
		params.urlREST			= probe.getParameter("urlREST");
		
		// Optional parameters
		params.pageLimit		= probe.getParameter("pageLimit");
		params.delimiter		= probe.getParameter("delimiter");
		params.headerLines		= probe.getParameter("headerLines");
		
		params.totalRow			= probe.getParameter("totalRow");
		params.groupId			= probe.getParameter("groupId");
		params.partNumber		= probe.getParameter("partNumber");
		params.totalPart		= probe.getParameter("totalPart");
		
		// Debug mode is normally the value of system properties: debug_mode
		params.debugMode = false;
		var debugMode			= probe.getParameter("debugMode");
		if (debugMode != null && ('' + debugMode) == 'true') {
			params.debugMode = true;
		}
		
		// Set default value
		if (params.delimiter == null) {
			params.delimiter = this.DEFAULT_DELIMITER_CHAR;
		}
		if (params.partNumber == null) {
			params.partNumber = 1;
		}
		if (params.totalPart == null) {
			params.totalPart = 1;
		}
		if (params.headerLines == null) {
			params.headerLines = 0;
		}
		
		// Extract return field(s) from URL
		var arr0 = params.urlREST.split('sysparm_fields=');
		var arr1 = arr0[1].split('&');
		params.returnFields = arr1[0];
		
		this._logMsg("Finished _getJSProbe()");
		return params;
	},
	
	/**
	* Get base URL of the current SNOW instance
	* @param instance URL of instance
	* @returns {String}
	* @private
	*/
	_getInstanceBaseURL: function (instance) {
		var instanceBase = instance + '';
		if (instanceBase.indexOf('/') != instanceBase.length - 1) {
			instanceBase += "/";
		}
		return instanceBase;
	},
	
	/**
	* Format input number with provided pattern
	* @param val
	* @param prefix
	* @param pattern
	* @param precision
	* @returns {String}
	* @private
	*/
	_formatNumber: function(val, prefix, pattern, precision) {
		if (!val) {
			val = 0;
		}
		var num_precision = parseInt(precision);
		var str_val = '' + val.toFixed(num_precision);
		var result = prefix + (pattern + str_val).substring(str_val.length);

		return result;
	},
	
	/**
	* Write log message
	* @param message
	* @param logType
	* @private
	*/
	_logMsg: function (message, logType) {
		var prefixStr = this.type;
		if (typeof logType == 'undefined') {
			logType = 'info';
		}
		if (logType == 'info' || logType == 'error') {
			ms.log(prefixStr + " " + logType.toUpperCase() + "*** " + message);
		}
		if (this.debug && logType == 'debug') {
			ms.log(prefixStr + " DEBUG *** " + message);
		}
	},
	
	type: "MFTV2MIDServer"
};
