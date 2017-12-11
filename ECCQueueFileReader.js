var ECCQueueFileReader = Class.create();
ECCQueueFileReader.prototype = {
	
	PAYLOAD: '', // Payload of ECC entry
	ECCRecord: null, // Entry from ECC queue
	reader: null, // Reader object
	buffer: '', // Buffer
	
	// Java packages
	StringReader: Packages.java.io.StringReader,
	BufferedReader: Packages.java.io.BufferedReader,
	InputStreamReader: Packages.java.io.InputStreamReader,
	ByteArrayOutputStream: Packages.java.io.ByteArrayOutputStream,
	
	/**
	* Regular expression pattern to extract data from payload
	* 1) Pattern with file name included in parenthesis: /<stdout>\(([^\)]+)\)$/
	* 2) Pattern without file name included in parenthesis: /<stdout>([^\)]+)$/
	*/ 
	regexpPattern: /<stdout>\(([^\)]+)\)$/,
	
	/**
	* Default constructor
	* @param ecc_sys_id
	* @param file_type
	* @param pattern
	*/
	initialize: function(ecc_sys_id, file_type, pattern) {
		this.ECCRecord = this._getEccEntry(ecc_sys_id);
		if (JSUtil.has(this.ECCRecord)) {
			this.PAYLOAD = '' + this.ECCRecord.payload;
			
			// Check whether file content is stored in payload
			if (this.PAYLOAD == '<see_attachment/>') {
				// File is too large and stored as attachment
				this.reader = this._getAttachmentAsReader(ecc_sys_id, 'payload.txt');
			} else {
				// File is stored in payload
				this.reader = new this.BufferedReader(new this.StringReader(this.PAYLOAD));
			}
		}
		
		if (JSUtil.notNil(pattern)) {
			this.regexpPattern = pattern;
		}
		
		// Read the first line of XML payload into as fileName
		this._fileName = this._readFirstLine2Buffer();
		
		// Check file type
		if (JSUtil.notNil(file_type) && (file_type.trim().toLowerCase() == 'csv' || file_type.trim().toLowerCase() == 'tsv')) {
			this._delimited = true;
		} else {
			this._delimited = false;
		}
		
		// Initialize variables
		this._eof			= false;
		this._buffer		= '';
		this._rawbuffer		= '';
		this._line			= '';
		this._rawline		= '';
		this._linebuffer	= '';
	},
	
	/**
	* Read the very first line of the XML payload
	* @return {String}
	* @private
	*/
	_readFirstLine2Buffer: function() {
		var result = '';
		if (JSUtil.has(this.reader)) {
			// Read 1 line from 'reader'
			var line = this.reader.readLine();
			
			// Parse the 1st line, which also contains XML tag
			var result = this.regexpPattern.exec(line);
			if (JSUtil.has(result) && result.length > 1) {
				result = result[1];
			}
		}
		return result;
	},
	
	/**
	* readLine()
	* 
	* Decodes the mime encoded data present either the "rawbuf" or "stream" member variables.
	* Each call to this method returns one line of data - typically a row from a CSV file.
	*
	* If no more data is available the method returns null.
	*
	*/
	readLine: function() {
		// Loop unconditionally until a "break" or "return" command is issued
		for ( ; ; ) {
			// ----------------
			// 1. Check if the "decoded" buffer contains at least one complete row + (LF/CR/CRLF)
			// ----------------
			var ndx, ch, dataLine;
			var quoted = false;
			for (ndx = 0; ndx < this._buffer.length; ndx++) {
				ch = this._buffer[ndx];
				if (!quoted && (ch == '\n' || ch == '\r')) {
					// Break if found a CR\LF\CRLF sequence that occurs outside of double-quotes
					break;
				}
				if (ch == '"' && this._delimited) {
					// File's format is delimited and a double-quote character is found
					quoted = !quoted;
				}
			}
			if (ndx < this._buffer.length) {
				// Found CR\LR\CRLF character in middle of decoded line
				dataLine = this._buffer.substring(0, ndx);
				ndx++; // Skip current CR\LF character
				
				// Check if next character is 'LF'
				if (ch == '\r' && ndx < this._buffer.length && this._buffer[ndx] == '\n') {
					ndx++; //Skip LF in CRLF sequence
				}
				this._buffer = this._buffer.substring(ndx);
				return dataLine;
			}
			
			// If the "_eof" flag is set (signals end of file raw data) then only return what is left in the buffer
			// The flag will be reset externally to return the next file's data in a multi-file stream
			if (this._eof) {
				dataLine = (this._buffer.length > 0) ? this._buffer : null;
				this._buffer = '';
				return dataLine;
			}
			
			// ----------------
			// 2. Read raw data-line from 'reader'
			// ----------------
			this._rawline = (this.reader) ? (''+this.reader.readLine()) : null;
			
			// ----------------
			// 3. Check if the end of file has been reached
			// Note: It happens if:
			//      1) _rawline = null (no more stream data), or
			//      2) a parenthesized file name is encontered, or
			//      3) the '</stdout>' xml tag is encountered
			// ----------------
			var stdIdx = -1;
            if (JSUtil.nil(this._rawline) || this._rawline.startsWith('(') || (stdIdx = this._rawline.indexOf('</stdout>')) >= 0) {
				this._eof = true; // Flag that no more data is available for the file
				
				// Set the file name to the next file name encountered (if any)
                this._fileName = '';
                if (this._rawline && this._rawline.startsWith('(')) {
					this._fileName = this._rawline.substring(1, this._rawline.indexOf(')'));
				}
				
				// If the '</stdout>' tag was encountered then there may still be data left on that line (up to the tag)
                this._rawline = (stdIdx < 0) ? '' : (this._rawline.substring(0, stdIdx));
            }
			
			// ----------------
			// 4. Decode the _rawline and add it to decoded buffer
			// ----------------
			this._linebuffer += this._rawline;
			var bytes = GlideStringUtil.base64DecodeAsBytes(this._linebuffer); // Decode base64 string as byte(s)
			var idx = this._getDecodableIdx(bytes);
			if (idx < this._linebuffer.length) {
				// Use the decodable-part of the mime string
				bytes = GlideStringUtil.base64DecodeAsBytes(this._linebuffer.substring(0, idx));
			    this._linebuffer = this._linebuffer.substring(idx); // Use the rest later
		    }  else {
				this._linebuffer = '';
			}

		    this._buffer += Packages.java.lang.String(bytes);
		}
	},
	
	/**
	* Find decodable part of the UTF-8 string (https://en.wikipedia.org/wiki/UTF-8)
	* @bytes
	* @return {Integer}
	*/
	_getDecodableIdx: function(bytes) {
	    var i = 0;
	    var j = 0;
	    for ( ; ; ) {
			// Character and mime ecoding boundary?
		    if (i <= bytes.length && (i % 3) == 0) j = i; // Yes
			
		    if (i >= bytes.length) break;
		    if (bytes[i] >= 0 || bytes[i] < -64) {
				// 1 byte encoding
				i++;
			} else {
				// C/D - 2 bytes encoding
			    var len = 2;
				
				// E   - 3 bytes encoding
			    if (bytes[i] <= -32) {
				    len++;
			        // F   - 4 bytes encoding
				    if (bytes[i] <= -16) len++;
			    }
			    i += len;
		    }
	    }
	    return j / 3 * 4; // Calculate the amount of the mime string to use
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
                var byteArrayOS = new this.ByteArrayOutputStream();
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
                return new this.BufferedReader(new this.InputStreamReader(attachmentIS));
            }
		}
		
		return null;
	},
	
	type: 'ECCQueueFileReader'
};