var MFTV2ECCEntry = Class.create();
MFTV2ECCEntry.prototype = {
    initialize: function(mid_server, topic, params) {
		this.mid_server = mid_server;
		this.topic = topic;
		this.queue = 'output';
		this.name = '';
		this.source = '';
		this.payloadDoc = new GlideXMLDocument("parameters");
		
		// Create payload
		for (var i in params) {
			var ele = this.payloadDoc.createElement("parameter");
			ele.setAttribute("name", i);
			ele.setAttribute("value", params[i]);
		}
		
		// ID of ECC entry which was created previously
		this.ecc_id = '';
	},
	
	/**
	* Set topic value
	* @param topic
	*/
	setTopic: function(topic) {
		this.topic = topic;
	},
	
	/**
	* Set mid_server value
	* @param mid_server
	*/
	setMIDServer: function(mid_server) {
		if (JSUtil.notNil(('' + mid_server).trim())) {
			this.mid_server = mid_server;
		}
	},
	
	/**
	* Set queue value
	* @param queue
	*/
	setQueue: function(queue) {
		this.queue = queue;
	},
	
	/**
	* Set payload value
	* @param payload
	*/
	setPayload: function(payload) {
		this.payload = payload;
	},
	
	/**
	* Set name value
	* @param name
	*/
	setName: function(name) {
		this.name = name;
	},
	
	/**
	* Set source value
	* @param source
	*/
	setSource: function(source) {
		this.source = source;
	},
	
	/**
	* Set parameters value
	* @param params
	*/
	setParameters: function(params) {
		this.payloadDoc = new GlideXMLDocument("parameters");
		// Create payload
		for (var i in params) {
			var ele = this.payloadDoc.createElement("parameter");
			ele.setAttribute("name", i);
			ele.setAttribute("value", params[i]);
		}
	},
	
	/**
	* Add parameter into current payload
	* @param name
	* @param value
	*/
	addParameter: function(name, value) {
		var ele = this.payloadDoc.createElement("parameter");
		ele.setAttribute("name", name);
		ele.setAttribute("value", value);
	},
	
	/**
	* Return ID of ECC entry which was created previously
	* @return {String}
	*/
	getECCEntryId: function() {
		return this.ecc_id;
	},
	
	/**
	* Create ECC queue record
	* @return {String}
	*/
	create: function() {
		if (JSUtil.notNil(('' + this.mid_server).trim())) {
			var gr = new GlideRecord('ecc_queue');
			gr.initialize();
			gr.agent	= 'mid.server.' + this.mid_server;
			gr.topic	= this.topic;
			gr.queue	= this.queue;
			gr.name		= this.name;
			gr.source	= this.source;
			gr.state	= 'ready';
			gr.payload	= this.payloadDoc.toString();

			this.ecc_id	= gr.insert();
			return this.ecc_id;
		}
		return '';
	},

    type: 'MFTV2ECCEntry'
};