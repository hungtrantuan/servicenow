var ECCQueueFileReader = Class.create();
ECCQueueFileReader.prototype = {
	
	PAYLOAD: '', // Payload of ECC entry
	ECCRecord: null, // Entry from ECC queue
	reader: null, // Buffer reader object
	
	/**
	* Default constructor
	*/
	initialize: function(ecc_sys_id) {
		this.ECCRecord = this._getEccEntry(ecc_sys_id);
		if (JSUtil.has(this.ECCRecord)) {
			this.PAYLOAD = '' + this.ECCRecord.payload;
			
			// Check whether file content is stored in payload
			if (this.PAYLOAD == '<see_attachment/>') {
				this.reader = this._getAttachmentAsReader(ecc_sys_id, 'payload.txt');
			}
		}
	},
	
	/**
	* Get entry from ECC queue by its ID
	* @param ecc_sys_id
	* @return {Object}
	* @private
	*/
	_getEccEntry: function(ecc_sys_id) {
		var grEcc = new GlideRecord('ecc_queue');
		if (grEcc.get(ecc_sys_id)) {
			// return GlideRecord object
			return grEcc;
		}
		// Return NULL
		return null;
	},
	
	/**
	* Get attachment data as XMLDocument
	* @param table_sys_id
	* @param file_name
	* @return {Object}
	* @private
	*/
	_getAttachmentAsDoc: function(table_sys_id, file_name) {
		var grAttachment = new GlideRecord("sys_attachment");
        if (grAttachment.canRead()) {
            grAttachment.addQuery('table_sys_id', table_sys_id);
            grAttachment.addQuery('table_name', 'ecc_queue');
            grAttachment.addQuery('file_name', file_name);
            grAttachment.query();

            if (grAttachment.next()) {
                var attachmentIS = new GlideSysAttachmentInputStream(grAttachment.sys_id.toString());
                var byteArrayOS = new Packages.java.io.ByteArrayOutputStream();
                // Obtain byte stream
                attachmentIS.writeTo(byteArrayOS);
                // Encode attachment file using Base64 algorithm
                var strData =  GlideStringUtil.base64Decode(GlideBase64.encode(byteArrayOS.toByteArray()));
               
                return new XMLDocument(strData);
            }
		}
		return null;
	},
	
	/**
	* Get attachment data as stream reader
	* @param table_sys_id
	* @param file_name
	* @return {Object}
	* @private
	*/
	_getAttachmentAsReader: function(table_sys_id, file_name) {
        var grAttachment = new GlideRecord("sys_attachment");
        if (grAttachment.canRead()) {
            grAttachment.addQuery('table_sys_id', table_sys_id);
            grAttachment.addQuery('table_name', 'ecc_queue');
            grAttachment.addQuery('file_name', file_name);
            grAttachment.query();

            if (grAttachment.next()) {
                var attachmentIS = new GlideSysAttachmentInputStream(grAttachment.sys_id.toString());
                return new Packages.java.io.BufferedReader(new Packages.java.io.InputStreamReader(attachmentIS));
            }
		}
		
		return null;
	},
	
	type: 'ECCQueueFileReader'
};