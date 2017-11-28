var MFTV2Log = Class.create();
MFTV2Log.prototype = {
    DEBUG_MODE: gs.getProperty('debug_mode', 'false') == 'true',
    LEVEL: gs.getProperty('log_level', GSLog.WARNING),
	INT_ID: 'MFTV2',
	
	/**
	* Default constructor
	* @param clazz   -Name of the caller
	* @params intId  -ID of integration
	*
	*/
    initialize: function(clazz, intId) {
		this._clazz = clazz || this.type;
		
		this._log = new GSLog(this.LEVEL, this._clazz);
        this._log.setLog4J();
        this._log.setLevel(this.LEVEL);
		this.INT_ID = intId || this.INT_ID;
    },
	
	/**
     * Private method to write log msg
     * @param level
     * @param message
     * @param source
     * @private
     */
    _logMsg: function (message, source, level) {
		// Inner method to retrieve timestamp value
        function _timeStamp() {
            var gdt = new GlideDateTime();
            var ms = (gdt.getNumericValue() % 1000) + '000';
            return gdt.getTime().getByFormat('HH:mm:ss') + '.' + ms.substr(0, 3);
        }

		// Identify source and level of log message
        source = source || this.type;
        level = level || this.LEVEL;

		// Build message prefix
        var prefix = '' + this.INT_ID + ' [' + _timeStamp() + '] [' + level + '] (' + source + ') : ';
		//gs.log(prefix + message);

		// Write log message based on log level
        switch (level) {
            case GSLog.WARNING:
                this._log.warn(prefix + message);
                break;
            case GSLog.ERROR:
                this._log.error(prefix + message);
                break;
            case GSLog.INFO:
                this._log.info(prefix + message);
                break;
            case GSLog.DEBUG:
                this._log.debug(prefix + message);
                break;
            default:
                this._log[this.LEVEL](prefix + message);
                break;
        }
    },

     /**
     * Set ID
     * @param intId
     */
    setID: function (intId) {
        this.INT_ID = intId || this.INT_ID;
    },
	
	/**
     * Default logging method
     * @param message
     * @param source
     */
    write: function (message, source) {
        if (this.DEBUG_MODE) {
			this._logMsg(message, source, GSLog.DEBUG);
		} else {
			this._logMsg(message, source, this.LEVEL);
		}
    },

    /**
     * Log DEBUG msg
     * @param message
     * @param source
     */
    debug: function (message, source) {
        this._logMsg(message, source, GSLog.DEBUG);
    },

    /**
     * Log WARNING msg
     * @param message
     * @param source
     */
    warn: function (message, source) {
        this._logMsg(message, source, GSLog.WARNING);
	},

    /**
     * Log ERROR msg
     * @param message
     * @param source
     */
    error: function (message, source) {
        this._logMsg(message, source, GSLog.ERROR);
    },

    /**
     * Log INFO msg
     * @param message
     * @param source
     */
    info: function (message, source) {
        this._logMsg(message, source, GSLog.INFO);
    },

    type: 'MFTV2Log'
};