var MFTV2Spooler = Class.create();
MFTV2Spooler.prototype = {
    
	TABLENAMES: {
		SPOOLING: 'u_mft_file_spooling',
		SPOOLING_DATA: 'u_mft_file_spooling_document',
	},
	SPOOLING_FILE_ID: null,
	N_ROW: 0,
	N_SIZE_BYTE: 0,
	
	// GlideRecord object to spooling file
	spoolingFileRecord: null,
	
	/**
	* Initialize an MFTV2Spooler object to write file
	* @param file_name    -Name of file in spooling table (required)
	* @param file_id      -ID of spooling file (optional)
	* @return {String}
	*/
	initialize: function(file_name, file_id) {
		if (JSUtil.nil(file_name)) {
			return;
		}
		
		var grSpooling = new GlideRecord(this.TABLENAMES.SPOOLING);
		if (JSUtil.notNil(file_id)) {
			if (grSpooling.get(file_id)) {
				this.SPOOLING_FILE_ID = file_id;
				this.N_SIZE_BYTE      = grSpooling.u_size_bytes;
				this.N_ROW            = grSpooling.u_row_counts;
			} else {
				return;
			}
		} else {
			grSpooling.initialize();
			grSpooling.u_file_name  = file_name;
			grSpooling.u_size_bytes = 0;
			grSpooling.u_row_counts = 0;
			this.SPOOLING_FILE_ID   = grSpooling.insert();
		}
    },
	
	/**
	* Write a line data into spooling file
	* @param line Data string
	* @returns {Boolean}
	*/
	write: function(line) {
		if (JSUtil.notNil(this.SPOOLING_FILE_ID)) {
			// Initialize Spooling Data object
			var grSpoolingData = new GlideRecord(this.TABLENAMES.SPOOLING_DATA);
			grSpoolingData.initialize();
			
			grSpoolingData.u_file_spooling = this.SPOOLING_FILE_ID;
			grSpoolingData.u_data          = line;
			grSpoolingData.u_length        = line.length;
			grSpoolingData.u_position      = this.N_ROW++;
			
			var id = grSpoolingData.insert();
			if (JSUtil.notNil(id)) {
				var size_bytes = parseInt(this.N_SIZE_BYTE, 10) + line.length;
				this.N_SIZE_BYTE = size_bytes;
				
				// Updating information of spooling file
				if (JSUtil.doesNotHave(this.spoolingFileRecord)) {
					this.spoolingFileRecord = new GlideRecord(this.TABLENAMES.SPOOLING);
					this.spoolingFileRecord.get(this.SPOOLING_FILE_ID);
				}
				this.spoolingFileRecord.u_row_counts = this.N_ROW;
				this.spoolingFileRecord.u_size_bytes = this.N_SIZE_BYTE;
				
				// Update spooling file
				this.spoolingFileRecord.update();
			}
			return true;
		}
		return false;
	},
	
	/**
	* Return ID of spooling file
	* @return {String}
	*/
	getSpoolingFileID: function() {
		return this.SPOOLING_FILE_ID;
	},

    type: 'MFTV2Spooler'
};