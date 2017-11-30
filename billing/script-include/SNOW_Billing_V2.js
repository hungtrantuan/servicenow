var SNOW_Billing_V2 = Class.create();
SNOW_Billing_V2.prototype = Object.extendsObject(BillingV2Base, {
	
	OUTBOUND_STATUS: {
		ADDED: 'added',
		PREPARED_TO_SEND: 'preparedtosend',
		SENT: 'sent',
		PENDING: 'pending',
	},
	
	/**
	* Constructor
	*/
	initialize: function() {
		// Initialize base class
		BillingV2Base.prototype.initialize.call(this /* BillingV2Base takes no arguments */);
		
		// Set ID for logging message
		this.log.setID('SNBILLING');
    },
	
	/**
	* Is called by the business rule to process inserted/created record.
	* @param current
	* @param previous
	*/
	ProcessRule: function(current, previous) {
		var mn = 'ProcessRule';
		
		// Load all triggers accross integrations
		var triggers = this.loadTrigger();
		if (triggers.length >  0) {
			// Check each trigger retrieved
			for (var i in triggers) {
				var trigger = triggers[i];
				
				//------------------------------------
				// Evaluate whether trigger can be executed
				//------------------------------------
				var cond = true;
				if (JSUtil.notNil(trigger.u_condition)) {
					// Evaluate condition
					try {
						cond = eval(trigger.u_condition);
					} catch (error) {
						this.log.warn("Evaluating trigger's condition error [" + this.TABLENAMES.TRIGGER + ":" + trigger.sys_id + "]: " + error, mn);
						continue;
					}
				}
				if (cond) {
					if (trigger.u_advanced) {
						// Evaluate advanced script
						try {
							if (!eval(trigger.u_script)) {
								this.log.info("Trigger's script evaluated false [" + this.TABLENAMES.TRIGGER + ":" + trigger.sys_id + "]", mn);
								continue;
							}
						} catch (error) {
							this.log.warn("Evaluating trigger's script error [" + this.TABLENAMES.TRIGGER + ":" + trigger.sys_id + "]: " + error, mn);
							continue;
						}
					}
				} else {
					this.log.info("Trigger's condition evaluated false [" + this.TABLENAMES.TRIGGER + ":" + trigger.sys_id + "]", mn);
					continue;
				}
				
				//------------------------------------
				// Perform the transformation
				//------------------------------------
				var fields = {};
				// Load data mappings configured for this trigger
				var mappings = this.loadDataMapping(trigger.sys_id.toString());
				if (mappings.length > 0) {
					// Processing each mapping field
					for (var j in mappings) {
						var mapping = mappings[j];
						var value = '';
						if (JSUtil.notNil(mapping.u_source_field)) {
							value = current.getValueOverrideBilling(mapping.u_source_field);
						}
						
						// Perfom advanced script
						if (mapping.u_advanced) {
							try {
								var params = {
									'srcValue': value,
									//'params': {'seq_number': seq_number},
									'current': current,
								};
								//var evaluator = new GlideScopedEvaluator();
								//current.putCurrent();
								var evalResult = this.gse.evaluateScript(mapping, 'u_script', params);
								//current.popCurrent();
								//this.log.debug('Type of evalResult=' + (typeof evalResult), mn);
								if ((typeof evalResult) == 'string') {
									fields[mapping.u_column_name] = '' + evalResult;
								} else { // typeof evalResult == 'object'
									if (JSUtil.has(evalResult)) {
										if (JSUtil.isJavaObject(evalResult)) { // Java object
											// Assume the Java class is always: 'java.lang.String'
											fields[mapping.u_column_name] = '' + evalResult;
										} else { // javascript object
											if (JSUtil.notNil(evalResult.status) && JSUtil.notNil(evalResult.status_message)) {
												if (evalResult.status == 'success') {
													fields[mapping.u_column_name] = evalResult.status_message;
												} else {
													// TODO: Process NOT 'success'
													fields[mapping.u_column_name] = '';
												}
											} else {
												fields[mapping.u_column_name] = JSON.stringify(evalResult);
											}
										}
									} else {
										fields[mapping.u_column_name] = '';
									}
								}
								//fields[mapping.u_column_name] = '' + evalResult;
							} catch (err) {
								this.log.error("Evaluation mapping's advanced script failed [" + this.TABLENAMES.MAPPING + ":" + mapping.sys_id + "]: " + err, mn);
							}
						} else {
							fields[mapping.u_column_name] = value;
						}
					}
				} else {
					this.log.info(this.ERRMSGS.NO_MAPPING + ' configured for the trigger [' +  this.TABLENAMES.TRIGGER + ':' + trigger.sys_id + ']', mn);
				}
				
				// Assemble fields in line by file-format
				var dataLine = JSON.stringify(fields);
				this.log.debug('Data line = [' + dataLine + ']', mn);
				
				// Save record to outbound table, set status to "Pending"
				this._addRecordToOutbound(trigger, current.getTableName(), current.sys_id.toString(), dataLine, this.OUTBOUND_STATUS.PENDING);
			}
		} else {
			this.log.info(this.ERRMSGS.NO_TRIGGER, mn);
		}
	},
	
	/**
	* Write record to outbound table, set status to "Pending"
	* @param trigger
	* @param table
	* @param source_record
	* @param line
	* @param status
	* @private
	*/
	_addRecordToOutbound: function(trigger, table, source_record, line, status) {
		// Initialize GlideRecord object
		var grOutbound = new GlideRecord(this.TABLENAMES.OUTBOUND);
		grOutbound.initialize();
		
		// Set field value
		grOutbound.u_integration_master	= trigger.u_integration_master.toString();
		grOutbound.u_source_trigger		= trigger.sys_id.toString();
		grOutbound.u_table				= table;
		grOutbound.u_document_id		= source_record;
		grOutbound.u_status				= status;
		grOutbound.u_data				= line;
		
		// Insert record into DB
		grOutbound.insert();
	},
	
	/**
	* Called by the scheduler to update data in staging table
	* @param trigger
	* @param nDay
	*/
	ProcessNDayRule: function(trigger, nDay) {
		var mn = 'ProcessNDayRule';
		// Parsing value of nDay
		this.log.debug("Process outbound data [trigger sys_id=" + trigger.sys_id + "] >= "+nDay+" day(s)", mn);
		var numDay = parseInt(nDay, 10);
		if (numDay == 'NaN') {
			numDay = 0;
		}
		
		// Get n-day value
		var updatedDT = new GlideDateTime();
		if (numDay > 0) {
			updatedDT.addDaysUTC(-numDay);
		}
		
		// Extract data from 'staging' table
		this.log.debug("Query data from '" + this.TABLENAMES.OUTBOUND + "' table [trigger sys_id=" + trigger.sys_id + "] that has sys_created_on<=" + updatedDT.getValue(), mn);
		var grRecord = this._getRecordFromOutboundNDay(trigger.sys_id.toString(), this.OUTBOUND_STATUS.PENDING, updatedDT.getValue());
		var nCnt = 0;
		while (grRecord.next()) {
			// Update value status to 'Added'
			this._updateOutboundRecord(grRecord.sys_id.toString(), '', this.OUTBOUND_STATUS.ADDED);
			nCnt++;
		}
		this.log.info("Updated ["+nCnt+"] entry in '" + this.TABLENAMES.OUTBOUND + "' table [trigger sys_id=" + trigger.sys_id + "]", mn);
	},
	
	/**
	* Query record(s) from outbound table by status and sys_updated_on <= date
	* @param trigger_id
	* @param status
	* @param date
	* @return {GlideRecord}
	* @private
	*/
	_getRecordFromOutboundNDay: function(trigger_id, status, date) {
		// Query data from Outbound table
		var grOutbound = new GlideRecord(this.TABLENAMES.OUTBOUND);
		grOutbound.addQuery('u_source_trigger', trigger_id);
		grOutbound.addQuery('u_status', status);
		grOutbound.addQuery('sys_created_on', '<=', date);
		grOutbound.query();
		
		// Return GlideRecord object for further processing
		return grOutbound;
	},
	
	/**
	* Called by the process that builds the outbound report
	* @param trigger
	*/
	BuildReport: function(trigger, scheduler) {
		var method = 'BuildReport';
		// Check whether the job is scheduled to run
		if (!this._validateRunTime(trigger, scheduler)) {
			this.log.info("Trigger [" + this.TABLENAMES.TRIGGER + ":" + trigger.sys_id + "] hasn't been scheduled to run", method);
			return;
		}
		
		// Extract data from outbound table
		var grRecord = this._getRecordFromOutbound(trigger.sys_id.toString(), this.OUTBOUND_STATUS.ADDED);
		if (grRecord.hasNext()) {
			// Initialize MFTSpooler to write outbound
			var spooler = new MFTV2Spooler(trigger.u_file_name);
			if (JSUtil.nil(spooler.getSpoolingFileID())) {
				this.log.error("Couldn't initialize MFTV2Spooler object [" + this.TABLENAMES.TRIGGER + ":" + trigger.sys_id + "].[filename=" + trigger.u_file_name + "]", method);
				return;
			}
			
			// Process data line(s)
			var header_line = '';
			while (grRecord.next()) {
				// Build file's header
				if (header_line.length == 0) {
					if (trigger.u_file_type == 'csv') {
						header_line = this._buildDelimitedHeader(grRecord, ',');
					} else if (trigger.u_file_type == 'tsv') {
						header_line = this._buildDelimitedHeader(grRecord, '\t');
					}
					
					if (header_line.length > 0) {
						spooler.write(header_line);
					}
				}
				
				// Retrieve collected data row and ensure formatted into final form
				var data_line = '';
				if (trigger.u_file_type == 'csv') {
					data_line = this._buildDelimitedLine(grRecord, ',');
				} else if (trigger.u_file_type == 'tsv') {
					data_line = this._buildDelimitedLine(grRecord, '\t');
				}
				
				if (data_line.length > 0) {
					spooler.write(data_line);
				}
				
				// Update outbound record
				this._updateOutboundRecord(grRecord.sys_id.toString(), 
										   trigger.u_file_name, 
										   this.OUTBOUND_STATUS.PREPARED_TO_SEND);
			}
			
			// Send file via MFTv2
			var params = {'trigger': trigger.sys_id.toString()}; /* Value(s) to be used by callback */
			var callback = 'BuildReportComplete';
			
			var mft = new MFTV2Transfer(this.type /* MFTV2Transfer needs caller's name to execute callback */, params);
			var result = mft.sendFile(trigger.u_integration_master.u_mid_server.name, // MID server
									  trigger.u_file_name, // Filename
									  spooler.getSpoolingFileID(), // File ID
									  trigger.u_integration_master.u_midserver_cmd,  // Command
									  callback, // Callback
									  trigger.u_integration_master.u_run_as.user_name // Run as
									 );
			if (result.status != 'success') {
				this.log.error('Error while sending file: ' + result.status_message, method);
			}
		} else {
			this.log.info('No outbound message found', method);
		}
	},
	
	
	/**
	* Callback function from the MFTv2 service that should reveal whether the process was completed successfully.
	* @param response
	*/
	BuildReportComplete: function(response) {
		this.log.debug('Response=[' + JSON.stringify(response) + ']', 'BuildReportComplete');
		
		var trigger = null;
		var grRecord = null;
		
		// Get ECC queue entry
		var grEcc = new GlideRecord(this.TABLENAMES.ECC_QUEUE);
		if (grEcc.get(response.ecc_sys_id)) {
			// Extract trigger ID from XML payload of ECC queue entry
			var trigger_id = gs.getXMLText(grEcc.payload, "//parameters/parameter[@name='trigger']/@value");
			this.log.debug('Extracted trigger ID from payload [' + trigger_id + ']', 'BuildReportComplete');
			trigger = new GlideRecord(this.TABLENAMES.TRIGGER);
			trigger.get(trigger_id);
			
			// Grab all records from Outbound table
			if (JSUtil.has(trigger)) {
				grRecord = this._getRecordFromOutbound(trigger_id, this.OUTBOUND_STATUS.PREPARED_TO_SEND);
			} else {
				this.log.error(this.ERRMSGS.NO_TRIGGER + "[" + this.TABLENAMES.TRIGGER + ":" + trigger_id + "]", 'BuildReportComplete');
			}
		} else {
			this.log.error("Couldn't retrieve ECC queue entry [" + this.TABLENAMES.ECC_QUEUE + ":" + response.ecc_sys_id + "]", 'BuildReportComplete');
		}
		
		// Branch processing base on response status
		if (response.status != 'success') {
			// Update all outbound record(s) back to 'added' status
			while(grRecord.next()) {
				this._updateOutboundRecord(grRecord.sys_id.toString(),
										   '',
										   this.OUTBOUND_STATUS.ADDED);
			}
			
			// Report incident
			var incidentId = this._reportIncident(trigger, response);
			if (JSUtil.nil(incidentId)) {
				this.log.error('Failed to create incident', 'BuildReportComplete');
			}
		} else {
			// Update all outbound record(s) to 'sent' status
			var sentdate = new GlideDateTime();
			while(grRecord.next()) {
				this._updateOutboundRecord(grRecord.sys_id.toString(), 
										   trigger.u_file_name, 
										   this.OUTBOUND_STATUS.SENT, 
										   sentdate.getValue());
			}
		}
	},
	
	/**
	* Query record(s) from outbound table by status
	* @param trigger_id
	* @param status
	* @return {GlideRecord}
	* @private
	*/
	_getRecordFromOutbound: function(trigger_id, status) {
		// Query data from Outbound table
		var grOutbound = new GlideRecord(this.TABLENAMES.OUTBOUND);
		grOutbound.addQuery('u_source_trigger', trigger_id);
		grOutbound.addQuery('u_status', status);
		grOutbound.orderBy('sys_created_on');
		grOutbound.query();
		
		// Return GlideRecord object for further processing
		return grOutbound;
	},
	
	/**
	* Update record(s) in outbound table with specify status
	* @param record_id
	* @param filename
	* @param status
	* @param sentdate
	* @return {GlideRecord}
	* @private
	*/
	_updateOutboundRecord: function(record_id, filename, status, sentdate) {
		// Update data in Outbound table
		var grOutbound = new GlideRecord(this.TABLENAMES.OUTBOUND);
		if (grOutbound.get(record_id)) {
			// Set field value
			grOutbound.u_file_name	= filename;
			grOutbound.u_status		= status;
			grOutbound.u_date_sent	= sentdate;
			
			// Update entry
			grOutbound.update();
		}
	},
	
	/**
	* Build header of delimited file
	* @param gr
	* @return {String}
	* @private
	*/
	_buildDelimitedHeader: function(gr, delimiter) {
		var fields = [];
		// Go through all fields
		var dataObj = JSON.parse(gr.u_data);
		for (var i in dataObj) {
			var fieldVal = this._getEscapedValue('' + i, delimiter);
			fields.push(fieldVal);
		}
		
		return fields.join(delimiter);
	},
	
	/**
	* Build data line of delimited file
	* @param gr
	* @return {String}
	* @private
	*/
	_buildDelimitedLine: function(gr, delimiter) {
		var fields = [];
		// Go through all fields
		var dataObj = JSON.parse(gr.u_data);
		for (var i in dataObj) {
			var fieldVal = this._getEscapedValue('' + dataObj[i], delimiter);
			fields.push(fieldVal);
		}
		
		return fields.join(delimiter);
	},
	
	/**
 	* Escape fields with embedded delimiters and remove CR character
 	* @param strVal   Value of string needs to be escaped
	* @param delimter Delimited character that separates field values
 	* @returns {String}
	* @private
 	*/
	_getEscapedValue: function(strVal, delimiter) {
		var matching = [delimiter, '"', '\n'];
		var quote = '"';
		var escaped = '""';
		
		strVal = strVal.replaceAll('\r',''); // Remove \r but keep \n for multi-line fields
		if (JSUtil.notNil(delimiter)) {
			for (var i in matching) {
				if (strVal.indexOf(matching[i]) >= 0) {
					var escapedVal = quote + strVal.replaceAll(quote, escaped) + quote;
					return escapedVal;
				}
			}
		}
		
		return strVal;
	},
	
	/**
	* Report incident for an trigger
	* @param trigger
	* @param response
	* @return {String}
	* @private
	*/
	_reportIncident: function(trigger, response) {
		// Initialize incident object
		var grIncident = new GlideRecord(this.TABLENAMES.INCIDENT);
		grIncident.initialize();
		
		grIncident.short_description = 'SNBILLING: BuildReport failed';
		// Apply template
		if (JSUtil.has(trigger) && JSUtil.notNil(trigger.u_incident_template)) {
			this.log.debug('Apply INC template [' + trigger.u_incident_template.name + ']', '_reportIncident');
			grIncident.applyTemplate(trigger.u_incident_template.name);
		}
		
		// Work notes
		var work_notes = 'Error: ' + response.status_message;
		var grEcc = new GlideRecord(this.TABLENAMES.ECC_QUEUE);
		if (grEcc.get(response.ecc_sys_id)) {
			// Extract information from ECC payload
			work_notes += '\n\nDetail: ' + grEcc.payload;
		}
		grIncident.work_notes = work_notes;
		
		// Insert record into DB
		var id = grIncident.insert();
		if (JSUtil.notNil(id)) {
			this.log.info('Created incident [' + grIncident.number + ']', '_reportIncident');
		}
		return id;
	},
	
	/**
	* Validate whether a trigger is in the right time to run, based on associated calendar (in Business Service)
	* @param trigger
	* @return {Boolean}
	* @private
	*/
	_validateRunTime: function(trigger, scheduler) {
		var method = '_validateRunTime';

		if (JSUtil.has(scheduler)) {
			var grBusinessSvc = new GlideRecord('cmdb_ci_service');
			if (grBusinessSvc.get(trigger.u_business_service.toString())) {
				// TODO:
				var billing_cycle = grBusinessSvc.u_calendar_type.toString();
				var timezone = parseFloat(grBusinessSvc.u_run_time_zone);
				if (!timezone) {
					timezone = 0.0;
				}
				
				var currentDT = new GlideDateTime();
				currentDT.addSeconds(timezone * 3600); // Determine timezone specified in Business Service
				
				var run_interval = this._getRunInterval(scheduler);
				var run_hour = this._getRunHour(grBusinessSvc.u_run_hours);
				var calendar = this._getBillingCalendar(billing_cycle, currentDT, run_hour.max_run_hour, run_interval);
				if (JSUtil.nil(calendar)) {
					this.log.info('Unable to determine calendar information', method);
					return false;
				}
				
				// Validate run date
				var proforma_days = parseInt('0' + grBusinessSvc.u_no_days, 10);
				var prevDT = new GlideDateTime(currentDT);
				prevDT.addSeconds(-run_interval);
				for (var day = 0; day <= proforma_days; day += proforma_days) {
					for (var i in run_hour.hours) {
						var runDT = new GlideDateTime(calendar.run_date);
						runDT.addSeconds(- 3600 * 24 * day);
						runDT.addSeconds(3600 * run_hour.hours[i]);
						
						this.log.info('Evaluating ['+runDT+'>'+prevDT+' AND '+runDT+'<='+currentDT+']', method);
						if (runDT > prevDT && runDT <= currentDT) {
							return true;
						}
					}
					if (proforma_days <= 0) {
						break;
					}
				}
				return false;
			} else {
				// Always return TRUE if there is no Business Service entry attached to trigger
				return true;
			}
		} else {
			this.log.info('Unable to determine any scheduler', method);
		}
		
		// Stop the job if there is no scheduler configured to run
		return false;
	},

	/**
	* Extract running interval of the scheduler
	* @param scheduler
	* @returns {Long}
	* @private
	*/
	_getRunInterval: function(scheduler) {
		// Default value: 1 day
		var secondsPerDay = 3600.0 * 24;
		var result = secondsPerDay;

		if (scheduler.run_type == 'weekly') {
			// 7 days
			result = 7.0 * secondsPerDay;
		} else if (scheduler.run_type == 'monthly') {
			// 1 month
			var currentDT = new GlideDateTime();
			var prevDT = new GlideDateTime();
			prevDT.addMonthsUTC(-1);
			var duration = GlideDateTime.subtract(prevDT, currentDT);
			result = duration.getNumericValue() / 1000;
		} else if (scheduler.run_type == 'periodically') {
			// period
			var periodDT = new GlideDateTime(scheduler.run_period);
			result = periodDT.getNumericValue() / 1000;
		}

		return result;
	},
	
	/**
	 * Get maximum value of run hour(s).
	 * @param run_hours
	 * @returns {Object}
	 */
	_getRunHour: function(run_hours) {
		// Get the list of run hours
		var hour_array = [];
		var hours = run_hours.split(',');
		for (var i in hours) {
			var hour_str = hours[i].trim();
			if (!hour_str) {
				continue;
			}
			
			var tmp = hour_str.split(':');
			var hour = parseFloat(tmp[0]);
			if (tmp.length > 1) {
				hour = parseFloat(tmp[0]) + parseFloat(tmp[1]) / 60.0;
			}
			
			if (('' + hour) != 'NaN') {
				hour_array.push(hour);
			}
		}

		// Set default value for array
		if (hour_array.length == 0) {
			hour_array.push(0.0);
		}
			
		// The maximum run hour will play a role in billing period extension..
		var max_value = Math.max(0, Math.max.apply(Math, hour_array));
		return {'hours': hour_array, 'max_run_hour': max_value};
	},
	
	/**
	 * Get value of start-date, end-date, run-date, duration from billing calendar.
	 * @param billing_cycle
	 * @param run_date
	 * @param max_run_hour
	 * @param run_interval
	 * @returns {Object}
	 */
	_getBillingCalendar: function(billing_cycle, run_date, max_run_hour, run_interval) {
		var method = '_getBillingCalendar';
		
		// Determine billing cycle
		var grBillingCycle = new GlideRecord('u_billing_cycle');
		if (!grBillingCycle.get(billing_cycle)) {
			this.log.info('Unable to determine billing cycle [u_billing_cycle:' + billing_cycle + ']', method);
			return null;
		}
		this.log.debug('Billing Cycle = ' + grBillingCycle.u_bill_cycle + ' (' + grBillingCycle.u_name + '), u_calculated = ' + grBillingCycle.u_calculated, method);
		
		// Get adjusted value of current datetime
		var adjustedDT = new GlideDateTime();
		adjustedDT.setValue(run_date);
		adjustedDT.addSeconds(-max_run_hour * 3600 - run_interval); // Ensures run hours fall within the period
		this.log.debug('Adjusted_date = ' + adjustedDT, method);
		
		// Determine billing calendar information
		var beginDT		= '';
		var endDT		= '';
		var runDT		= '';
		var periodStr	= '';
		if (grBillingCycle.u_calculated != 1) { /*Calendar data is loaded into Billing Calendar table*/
			// Calendars are assumed to be in the BS TZ. Match the period to today (current time excluding minutes and seconds)
			var grBillingCalendar = new GlideRecord('u_billing_calendar');
			grBillingCalendar.addQuery('u_bill_cycle', grBillingCycle.sys_id.toString());
			grBillingCalendar.addQuery('u_begin_date', '<=', adjustedDT.getDate());
			grBillingCalendar.addQuery('u_end_date', '>=', adjustedDT.getDate());
			grBillingCalendar.query();
			if (!grBillingCalendar.next()) {
				this.log.info('Unable to determine billing calendar in cycle ['+grBillingCycle.u_name +'] which has [begin_date <= '+run_date+' (-'+max_run_hour+' hour(s)) <= end_date]', method);
				return null;
			}
			
			beginDT = new GlideDateTime(('' + grBillingCalendar.u_begin_date) + ' 00:00:00');
			endDT = new GlideDateTime(('' + grBillingCalendar.u_end_date) + ' 23:59:59');
			runDT = new GlideDateTime(('' + grBillingCalendar.u_run_date) + ' 00:00:00');
			periodStr = '' + grBillingCalendar.u_period;
		} else { /*Calendar data is calculated*/
			var calculated_startDT = new GlideDateTime('' + grBillingCycle.u_first_date + ' 00:00:00');
			var calculated_endDT = (('' + grBillingCycle.u_last_date)?new GlideDateTime('' + grBillingCycle.u_last_date + ' 00:00:00'):null);
			
			if (grBillingCycle.u_interval == 'D' || grBillingCycle.u_interval == 'W' || grBillingCycle.u_interval == 'F') {
				var calculate_interval = {'D': 1, 'W': 7, 'F': 14}[grBillingCycle.u_interval];
				
				var dateDiff = GlideDateTime.subtract(calculated_startDT, adjustedDT);
				var N = Math.floor((dateDiff.getNumericValue() / 1000) / (3600.0 * 24 * calculate_interval));
				this.log.debug('First calculated date=['+calculated_startDT+'] - Adjusted date=['+adjustedDT+'] - dateDiff=['+N+' (day)]', method);
				if (N < 0) {
					return null; // No periods prior to this time
				}
				
				beginDT = new GlideDateTime(calculated_startDT);
				beginDT.addDaysUTC(calculate_interval * N);
				endDT = new GlideDateTime(calculated_startDT);
				endDT.addSeconds(3600.0 * 24 * calculate_interval * (N + 1));
				
				// Validate whether start_date is in range [calculated_startDT..calculated_endDT]
				if (calculated_endDT && beginDT > calculated_endDT) {
					return null; // No periods beyond this time
				}
			} else if (grBillingCycle.u_interval == 'M') {
				var nDayDiff = calculated_startDT.getDayOfMonth() - adjustedDT.getDayOfMonth();
				this.log.debug('First calculated date=['+calculated_startDT+'] - Adjusted date=['+adjustedDT+'] - nDayDiff=['+ nDayDiff+' (day)]', method);
				
				beginDT = new GlideDateTime('' + adjustedDT.getDate() + ' 00:00:00');
				beginDT.addSeconds(3600.0 * 24 * nDayDiff);
				if (nDayDiff > 0) {
					beginDT.addMonthsUTC(-1);
				}
				if (adjustedDT < beginDT) {
					return null; // No periods prior to this time
				}
				endDT = new GlideDateTime(beginDT);
				endDT.addMonthsUTC(1);
				
				// Validate whether start_date is in range [calculated_startDT..calculated_endDT]
				if (calculated_endDT && beginDT > calculated_endDT) {
					return null; // No periods beyond this time
				}
			} else {
				this.log.info('Unsupported calendar interval!', method);
				return null;
			}
			
			runDT = endDT;
		}
		var calendar = {'begin_date': beginDT.getValue(), 'end_date': endDT.getValue(), 'run_date': runDT.getValue(), 'period': periodStr};
		this.log.info('Calendar information: ' + JSON.stringify(calendar), method);
		
		return calendar;
	},
	
	type: 'SNOW_Billing_V2'
});