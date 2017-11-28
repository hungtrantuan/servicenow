var MFTV2Transfer = Class.create();
MFTV2Transfer.prototype = {
	DEBUG_MODE: gs.getProperty('dxc.mftv2.debug_mode', 'false') == 'true',
	DEFAULT_SCRIPT: '(new MFTV2MIDServer()).saveFile2MIDServer();',
	DEFAULT_TABLE: 'u_mft_file_spooling_document',
	DEFAULT_RETURN_FIELDS: 'u_data',
	DEFAULT_ID_FIELD_NAME: 'u_file_spooling',
	DEFAULT_MID_FOLDER: gs.getProperty('dxc.mftv2.midserver.directory', 'd:\\MFTBatch'),
	
	CALLER: '',
	
	/**
	* Default constructor
	* @param clazz  Name of caller object
	* @param params Information that would be sent back to caller, e.g. Integration ID
	*/
    initialize: function(clazz, params) {
		this.log = new MFTV2Log(this.type);
		
		// Grab caller's name
		if (JSUtil.notNil(clazz)) {
			this.CALLER = clazz;
		}
		
		// Initialize parameters
		if (!JSUtil.has(params)) {
			this.params = {};
		} else {
			var pName = [];
			for (var i in params) {
				pName.push(''+i);
			}
			this.params = params;
			this.params.returned_params = pName.join(',');
		}
		
		// Initialize default values for XML payload
		this.params.script      = this.DEFAULT_SCRIPT;
		this.params.midFolder   = this.DEFAULT_MID_FOLDER + '\\out';
		this.params.source      = 'MFTV2';
		this.params.debugMode   = this.DEBUG_MODE;
		this.params.skip_sensor = 'true';
		this.params.callerClass = this.CALLER;
    },
	
	/**
	*
	* @param mid_server -Name of MID server used to perform the transfer.
	* @param file_name  -Name of file that will be sent.
	* @param file_id    -ID of file in spooling table.
	* @param cmd_str    -Batch script that will be executed on MID server to send/receive file
	*                    Sample: SFTPTransferFile.bat -u username@hostname -p "a5:15:33:14:5c:be:22:96:5e:36:bb:c9:69:88:4b:a3" -pk private_key.ppk -r "Incomming" -a "CSCi"
	* @param callback   -Caller's method that will be executed to process response data
	* @param run_as     -UserID that is used to execute 'callback' script (required if 'callback' is not empty)
	* @return {Object}
	*/
	sendFile: function(mid_server, file_name, file_id, cmd_str, callback, run_as) {
		var method = 'sendFile';
		
		var result = {status:'success', status_message:''};
		
		// Validate input parameter(s)
		if (JSUtil.nil(mid_server) || JSUtil.nil(file_name) || JSUtil.nil(cmd_str) || JSUtil.nil(file_id) || JSUtil.nil(run_as)) {
			var fields = [];
			if (JSUtil.nil(mid_server)) {fields.push('mid_server');}
			if (JSUtil.nil(file_name)) {fields.push('file_name');}
			if (JSUtil.nil(file_id)) {fields.push('file_id');}
			if (JSUtil.nil(cmd_str)) {fields.push('cmd_str');}
			if (JSUtil.notNil(callback) && JSUtil.nil(run_as)) {fields.push('run_as');}
			
			if (fields.length > 0) {
				result.status = 'error';
				result.status_message = 'Required parameter(s) is not supplied: ' + fields;
			}
		}
		
		if (result.status == 'success') {
			// Set default value of run_as and callback
			if (JSUtil.nil(callback)) {
				callback = '';
			}
			if (JSUtil.nil(run_as)) {
				run_as = '';
			}
			
			// Append supplied parameters
			this.params.callback	= callback;
			this.params.runAs		= run_as;
			this.params.fileName	= file_name;
			this.params.midServer	= mid_server;

			// Build REST table API to query data
			var url_opts = [];
			url_opts.push('/api/now/table/');
			url_opts.push(this.DEFAULT_TABLE);
			url_opts.push('?sysparm_query=');
			url_opts.push(this.DEFAULT_ID_FIELD_NAME + '=' + file_id);
			url_opts.push('%5eORDERBYu_position');
			url_opts.push('&sysparm_fields=');
			url_opts.push(this.DEFAULT_RETURN_FIELDS);
			this.params.urlREST = url_opts.join('');
			
			// Validate input parameter of command
			var cmd_opts = [];
			cmd_opts.push(cmd_str);
			if (cmd_str.indexOf('-f') == -1) {
				cmd_opts.push('-f ' + this.DEFAULT_MID_FOLDER + '\\out\\' + file_name);
			}
			if (cmd_str.indexOf('-d') == -1) {
				cmd_opts.push('-d outbound');
			}
			this.params.cmdStr = this.DEFAULT_MID_FOLDER + '\\' +  cmd_opts.join(' ');
			
			// Send JavascriptProbe to MID server to save file to MID server
			this.log.info('Sending file with params [' + JSON.stringify(this.params) + ']', method);
			var jsProbe = new MFTV2ECCEntry(mid_server, 'JavascriptProbe', this.params);
			jsProbe.setName('MFTV2Transfer');
			jsProbe.setSource('MFTV2');
			var sys_id = jsProbe.create();
			
			// Check result
			if (JSUtil.nil(sys_id)) {
				result.status = 'error';
				result.status_message = "Couldn't create ECC entry on MID server [" + mid_server + "] with params [" + JSON.stringify(this.params) + "]";
				this.log.error(result.status_message, method);
			} else {
				result.status = 'success';
				result.status_message = sys_id;
			}
		}
		this.log.debug('Result=['+JSON.stringify(result)+']', method);
		return result;
	},
	
	/**
	*
	* @param mid_server -Name of MID server used to perform the transfer.
	* @param file_name  -Name of file that will be sent/received
	* @param cmd_str    -Batch script that will be executed on MID server to receive file
	*                    Sample: SFTPTransferFile.bat -u username@hostname -p "a5:15:33:14:5c:be:22:96:5e:36:bb:c9:69:88:4b:a3" -pk private_key.ppk -r "Outgoing" -a "CSCi"
	* @param callback   -Caller's method that will be executed to process response data
	* @param run_as     -UserID that is used to execute 'callback' script (required if 'callback' is not empty)
	* @return {Object}
	*/
	receiveFile: function(mid_server, file_name, cmd_str, callback, run_as, params) {
		var method = 'receiveFile';
		var result = {status:'success', status_message:''};
		
		// Validate input parameter(s)
		if (JSUtil.nil(mid_server) || JSUtil.nil(file_name) || JSUtil.nil(cmd_str) || JSUtil.nil(run_as)) {
			var fields = [];
			if (JSUtil.nil(mid_server)) {fields.push('mid_server');}
			if (JSUtil.nil(file_name)) {fields.push('file_name');}
			if (JSUtil.nil(cmd_str)) {fields.push('cmd_str');}
			if (JSUtil.notNil(callback) && JSUtil.nil(run_as)) {fields.push('run_as');}
			
			if (fields.length > 0) {
				result.status = 'error';
				result.status_message = 'Required parameter(s) is not supplied: ' + fields;
			}
		} 
		
		if (result.status == 'success') {
			// Set default value of run_as and callback
			if (JSUtil.nil(callback)) {
				callback = '';
			}
			if (JSUtil.nil(run_as)) {
				run_as = '';
			}
			
			// Append supplied parameters
			this.params.callback	= callback;
			this.params.runAs		= run_as;
			this.params.fileName	= file_name;
			this.params.midServer	= mid_server;
			
			// Validate input parameter of command
			var cmd_opts = [];
			cmd_opts.push(cmd_str);
			if (cmd_str.indexOf('-f') == -1) {
				cmd_opts.push('-f ' + this.DEFAULT_MID_FOLDER + '\\in\\' + file_name);
			}
			if (cmd_str.indexOf('-d') == -1) {
				cmd_opts.push('-d inbound');
			}
			this.params.name = this.DEFAULT_MID_FOLDER + '\\' + cmd_opts.join(' ');
			
			// Send Command to MID server to save file to MID server
			this.log.info('Receiving file with params [' + JSON.stringify(this.params) + ']', method);
			var jsProbe = new MFTV2ECCEntry(mid_server, 'Command', this.params);
			jsProbe.setName('MFTV2Transfer');
			jsProbe.setSource('MFTV2');
			var sys_id = jsProbe.create();
			
			// Check result
			if (JSUtil.nil(sys_id)) {
				result.status = 'error';
				result.status_message = "Couldn't create ECC entry on MID server [" + mid_server + "] with params [" + JSON.stringify(this.params) + "]";
				this.log.error(result.status_message, method);
			} else {
				result.status = 'success';
				result.status_message = sys_id;
			}
		}
		this.log.debug('Result=['+JSON.stringify(result)+']', method);
		return result;
	},
	
	/**
	* React to response payload of the script-execution
	* @param ecc_id
	* @return {Object}
	*/
	responseScriptExecution: function(ecc_id) {
		var method = 'responseScriptExecution';
		
		var status = '';
		var status_message = '';
		
		// Retrieve MID server's response
		var grEcc = this._getECCEntry(ecc_id);
		if (JSUtil.has(grEcc)) {
			this.log.debug('Payload [' + grEcc.payload + ']', this.type);
			
			// Extract MID server's response from payload
			status = gs.getXMLText(grEcc.payload, '//results/status');
			status_message = gs.getXMLText(grEcc.payload, '//results/status_message');
			this.log.info('Responded status=[' + status + '], message=[' + status_message + ']', method);
			
			// Extract 'run_as' user ID and callback script from XML payload
			var callerClass = gs.getXMLText(grEcc.payload, "//parameters/parameter[@name='callerClass']/@value");
			var callback = gs.getXMLText(grEcc.payload, "//parameters/parameter[@name='callback']/@value");
			var run_as = gs.getXMLText(grEcc.payload, "//parameters/parameter[@name='runAs']/@value");
			if (JSUtil.nil(run_as)) {
				run_as = '' + grEcc.sys_created_by;
				this.log.debug("Use MID user [" + run_as + "] as run_as", method);
			}
			
			if (status == 'success') {
				// Extract more parameters from payload
				var cmd_str = gs.getXMLText(grEcc.payload, "//parameters/parameter[@name='cmdStr']/@value");
				var source_id = gs.getXMLText(grEcc.payload, "//parameters/parameter[@name='sourceId']/@value");
				var mid_server = gs.getXMLText(grEcc.payload, "//parameters/parameter[@name='midServer']/@value");
				
				// Build 'Command' parameters
				var params = {
					'name': cmd_str,
					'source': 'MFTV2',
					'sourceId': source_id,
					'skip_sensor': 'true',
					'runAs': run_as,
					'callback': callback,
					'callerClass': callerClass,
				};
				
				// Extract other parameters from payload
				var returned_params = gs.getXMLText(grEcc.payload, "//parameters/parameter[@name='returned_params']/@value");
				if (JSUtil.notNil(returned_params)) {
					var pArr = returned_params.split(',');
					for (var i in pArr) {
						var pName = pArr[i];
						params[pName] = gs.getXMLText(grEcc.payload, "//parameters/parameter[@name='"+pName+"']/@value");
					}
				}
				
				// Impersonate user to 'run_as' user ID
				this.log.info("Impersonate the user ID [" + run_as + "]", method);
				gs.getSession().impersonate(run_as);

				// Send command to MID server to send file to remote host
				var jsProbe = new MFTV2ECCEntry(mid_server, 'Command', params);
				jsProbe.setName('MFTV2Transfer');
				jsProbe.setSource('MFTV2');
				var sys_id = jsProbe.create();

				// Check result
				if (JSUtil.nil(sys_id)) {
					status = 'error';
					status_message = "Couldn't create ECC entry on MID server [" + mid_server + "] with params [" + JSON.stringify(params) + "]";
					this.log.error(status_message, method);
				}
			}
			
			// Execute callback script in case of error
			if (status != 'success') {
				if (JSUtil.notNil(run_as) && JSUtil.notNil(callback) && JSUtil.notNil(callerClass)) {
					// Impersonate user to 'run_as' user ID
					this.log.info("Impersonate the user ID [" + run_as + "]", method);
					gs.getSession().impersonate(run_as);
					
					// Execute callback
					/*
					var vars = new Packages.java.util.HashMap();
					vars.put('params', {'status': status, 'status_message': status_message, 'ecc_sys_id': ecc_id});
					GlideEvaluator.evaluateStringWithGlobals(callback, vars);
					*/
					try {
						var response = {'status': status, 'status_message': status_message, 'ecc_sys_id': ecc_id};
						var runObj = new global[callerClass]();
						runObj[callback](response);
					} catch (ex) {
						this.log.error('Failed to execute callback method ['+callerClass+'.'+callback+'()]: ' + ex, this.type);
					}
				} else {
					if (JSUtil.notNil(callback)) {
						status = 'error';
						status_message = 'No [run_as] was supplied to execute the callback [' + callback + ']';
						this.log.error(status_message, method);
					}
				}
			}
			this.log.debug('End responseScriptExecution(): status=[' + status + '], message=[' + status_message + ']', method);
		} else {
			// This case must not happen in any case
			status = 'error';
			status_message = "Couldn't retrieve response from MID server [ecc_id=" + ecc_id + "]";
			this.log.error(status_message, method);
		}
		
		return {'status': status, 'status_message': status_message};
	},
	
	/**
	* React to response payload of the command-execution
	* @param ecc_id
	* @return {Object}
	*/
	responseCmdExecution: function(ecc_id) {
		var method = 'responseCmdExecution';
		
		var status = '';
		var status_message = '';
		
		// Retrieve MID server's response
		var grEcc = this._getECCEntry(ecc_id);
		if (JSUtil.has(grEcc)) {
			this.log.debug('Payload [' + grEcc.payload + ']', method);
			
			// Extract MID server's response from payload
			var stdout_msg = gs.getXMLText(grEcc.payload, '//results/result/stdout');
			var stderr_msg = gs.getXMLText(grEcc.payload, '//results/result/stderr');
			if (JSUtil.notNil(stderr_msg)) {
				status = 'error';
				status_message = stderr_msg;
			} else {
				status = 'success';
				status_message = ecc_id;
			}
			this.log.info('Execute method with responded status=[' + status + '], message=[' + status_message + ']', method);
			
			// Extract 'run_as' user ID from payload
			var callerClass = gs.getXMLText(grEcc.payload, "//parameters/parameter[@name='callerClass']/@value");
			var run_as = gs.getXMLText(grEcc.payload, "//parameters/parameter[@name='runAs']/@value");
			var callback = gs.getXMLText(grEcc.payload, "//parameters/parameter[@name='callback']/@value");
			if (JSUtil.notNil(run_as) && JSUtil.notNil(callback) && JSUtil.notNil(callerClass)) {
				// Impersonate user to 'run_as' user ID
				this.log.info("Impersonate the user ID [" + run_as + "]", method);
				gs.getSession().impersonate(run_as);
				
				// Execute callback
				/*
				var vars = new Packages.java.util.HashMap();
				vars.put('params', {'status': status, 'status_message': status_message, 'ecc_sys_id': ecc_id});
				GlideEvaluator.evaluateStringWithGlobals(callback, vars);
				*/
				try {
					var response = {'status': status, 'status_message': status_message, 'ecc_sys_id': ecc_id};
					var runObj = new global[callerClass]();
					runObj[callback](response);
				} catch (ex) {
					this.log.error('Failed to execute callback method ['+callerClass+'.'+callback+'()]: ' + ex, method);
				}
			} else {
				if (JSUtil.notNil(callback)) {
					status = 'error';
					status_message = 'No [run_as] was supplied to execute the callback [' + callback + ']';
					this.log.error(status_message, method);
				}
			}
			this.log.debug('End responseCmdExecution(): status=[' + status + '], message=[' + status_message + ']', method);
		} else {
			// This case must not happen in any case
			status = 'error';
			status_message = "Couldn't retrieve response from MID server [ecc_id=" + ecc_id + "]";
			this.log.error(status_message, method);
		}
		
		return {'status': status, 'status_message': status_message};
	},
	
	/**
	* Retrieve ECC entry by its SysID
	* @param ecc_id
	* @return {Object}
	* @private
	*/
	_getECCEntry: function(ecc_id) {
		var result = null;
		if (JSUtil.notNil(ecc_id)) {
			var grEcc = new GlideRecord('ecc_queue');
			if(grEcc.get(ecc_id)) {
				result = grEcc;
			}
		}
		return result;
	},

    type: 'MFTV2Transfer'
};