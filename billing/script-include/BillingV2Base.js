var BillingV2Base = Class.create();
BillingV2Base.prototype = {
	
	// Table names
	TABLENAMES: {
		INTEGRATION_REGISTRY: 'u_integrations_registry',
		TRIGGER: 'u_snowbilling_trigger',
		MAPPING: 'u_snowbilling_mapping',
		OUTBOUND: 'u_snowbilling_outbound',
		ECC_QUEUE: 'ecc_queue',
		INCIDENT: 'incident',
	},
	
	ERRMSGS: {
        NO_INTEGRATION: 'Unable to determine integration',
		NO_TRIGGER: 'Unable to determine trigger',
        NO_MAPPING: 'Unable to determine mapping',
    },
	
	/**
	* Constructor
	*/
    initialize: function() {
		this.log = new MFTV2Log(this.type);
		this.gse = new GlideScopedEvaluator();
		
		/**
 		* Override the GlideRecord so that dot notation can be passed in
 		* @param field
 		* @param _grPointer
 		* @returns {String}
 		*/
		GlideRecord.prototype.getDisplayValueOverrideBilling = function(field, _grPointer) {
			if (!field) return '';
			if (!_grPointer) _grPointer = this;
				
			var fields = field.split('.');
			if (fields.length == 1) {
				if (_grPointer[field] != undefined) {
					var val = _grPointer[field].getDisplayValue();
					return (val == null)?'':(val + '');
				} else {
					return '';
				}
			} else {
				if (_grPointer[fields.slice(0,1)].getReferenceTable() != undefined ) {
					var _objRef = new GlideRecord(_grPointer[fields.slice(0,1)].getReferenceTable());
					_objRef.get(_grPointer.getValue(fields.slice(0,1)));
					return _grPointer.getDisplayValueOverrideBilling(fields.slice(1).join("."), _objRef);
				} else {
					return _grPointer.getDisplayValueOverrideBilling(fields.slice(1).join("."), _grPointer[fields.slice(0, 1)]);
				}
			}
		};
		
		/**
 		* Override the GlideRecord so that dot notation can be passed in for a value
 		* @param field
 		* @param _grPointer
 		* @returns {String}
 		*/
		GlideRecord.prototype.getValueOverrideBilling = function(field, _grPointer) {
			if (!field) return '';
			if (!_grPointer) _grPointer = this;
				
			var fields = field.split('.');
			if (fields.length == 1) {
				if (_grPointer[field] != undefined) {
					var val = _grPointer.getValue(field);
					return (val == null)?'':(val + '');
				} else {
					return '';
				}
			} else {
				if (_grPointer[fields.slice(0,1)].getReferenceTable() != undefined ) {
					var _objRef = new GlideRecord(_grPointer[fields.slice(0,1)].getReferenceTable());
					_objRef.get(_grPointer.getValue(fields.slice(0,1)));
					return _grPointer.getValueOverrideBilling(fields.slice(1).join("."), _objRef);
				} else {
					return _grPointer.getValueOverrideBilling(fields.slice(1).join("."), _grPointer[fields.slice(0, 1)]);
				}
			}
		};
    },
	
	/**
	* Load information of an integration master entry by its name
	* @param integration_name
	* @return {Object}
	*/
	getIntegrationByName: function(integration_name) {
		// Query active integration
		var grIntegration = new GlideRecord(this.TABLENAMES.INTEGRATION_REGISTRY);
		grIntegration.addQuery('u_integration_name', integration_name);
		grIntegration.addQuery('u_active', true);
		grIntegration.query();
		if (grIntegration.next()) {
			return grIntegration;
		}
		
		// No integration found
		return null;
	},
	
	/**
	* Load information of an integration master entry by its id
	* @param integration_id
	* @return {Object}
	*/
	getIntegrationById: function(integration_id) {
		// Query active integration
		var grIntegration = new GlideRecord(this.TABLENAMES.INTEGRATION_REGISTRY);
		if (grIntegration.get(integration_id)) {
			return grIntegration;
		}
		
		// No integration found
		return null;
	},
	
	/**
	* Load all triggers configured for a specific integration.
	* @param integration_id
	* @return {Array}
	*/
	loadTrigger: function(integration_id) {
		var mn = 'loadTrigger';
		// Query active trigger(s) configured of the specific integration
		var grTrigger = new GlideRecord(this.TABLENAMES.TRIGGER);
		if (JSUtil.notNil(integration_id)) {
			grTrigger.addQuery('u_integration_master', integration_id);
		}
		grTrigger.addQuery('u_active', true);
		grTrigger.orderBy('u_order');
		grTrigger.query();
		
		// Build array of triggers
		var triggers = [];
		var i = 0;
		while(grTrigger.next()) {
			triggers[i] = new GlideRecord(this.TABLENAMES.TRIGGER);
			triggers[i].get(grTrigger.sys_id.toString());
			i++;
		}
		return triggers;
	},
	
	/**
	* Load all active data mappings configured for a particular trigger
	* @param trigger_id
	* @return {Array}
	*/
	loadDataMapping: function(trigger_id) {
		// Query all active data mappings of a specific trigger
		var grMapping = new GlideRecord(this.TABLENAMES.MAPPING);
		grMapping.addQuery('u_source_trigger', trigger_id);
		grMapping.addQuery('u_active', true);
		grMapping.orderBy('u_order');
		grMapping.query();
		
		// Build array of mappings
		var mappings = [];
		var i = 0;
		while(grMapping.next()) {
			mappings[i] = new GlideRecord(this.TABLENAMES.MAPPING);
			mappings[i].get(grMapping.sys_id.toString());
			i++;
		}
		return mappings;
	},
	
    type: 'BillingV2Base'
};