import './controlTree'
import init from './core'

function logPuter( state, signal) {  
  console.log( 
    "Log: ",
    signal._ctrl.type[2], 
    JSON.stringify(signal._ctrl.source), 
    JSON.stringify(signal.parameters)
  );
  // return nothing
}


// configure and start the lupin system
// all parameters are optional
// Config object used so the parameters actually provided are named
// valid ones are:
//  initialState, initial state object to load into lupin, should be an immutable map
//  signal$,      stream of signals to drive solution - e.g. TCP listener, worker eventSource

// future?:
//  commandTree,  tree of signal processors 
// observers      tree of state observers

function lupin( cfg)
{
  let core = cfg ? init( cfg.signal$, cfg.initialState ) : init(),
  api = {
    invoke(  // interface to issue a command for processing
      cmd, // command signal object including command:_type and parameters
      source)  // source trace object
    {
      // validate command object a wee bit
      if( ('_ctrl' in cmd) && cmd._ctrl.type.length > 0 ) {
        // convert the path from "lupin.init" to ["lupin","init"] form if required
        if( typeof cmd._ctrl.type === 'string') {
          cmd._ctrl.type = cmd._ctrl.type.split('.'); 
        }
      } else {
          throw { message: "Invalid command object at invoke." }
      } 

      cmd._ctrl.source = ( source !== undefined) ? source : {}
      cmd._ctrl.source.timestamp = Date.now();

      // add code to populate the source object from ths tack trace
      //StackTrace.get().then(callback).catch(errback)
      //printStackTrace()

      // actual most call to emmit the command to the stream
      core.getIn( ['lupin','core','event$']).push( cmd)  
    },

    // convenience function to start a module specific command tree
    module( 
      modulePath,
      postprocessor,  // processor to clean up after the module signal processors
      catcher)         // processor to handle unprocessed commands in this module's namespace
    {
      // convert the path from "lupin.init" to ["lupin","init"] if required
      var path = (typeof modulePath === 'string') ? modulePath.split('.') : modulePath;

      this.invoke( { _ctrl:{ type:[ "lupin", "AddModule"]}, 
        path, postprocessor, catcher })
    },

    // construct a method to invoke a new command, bind it to a signal tree
    command( // create the command invocation function. Returns the function.
      cmdPath, // full pathname of the command which this function will invoke
                // can be either a string delimited with '.' or an array of strings
                //  e.g.: "lupin.init" or ["lupin", "init"]
      proc) // function to be invoked to execute on the subscribed command set
                 // this function must fit the signature 
                 // processor( state, command) -> [ state, effect, ...]]
      {
      // convert the path from "lupin.init" to ["lupin","init"] if required
      var path = (typeof cmdPath === 'string') ? cmdPath.split('.') : cmdPath;

       // subscribe the processor to this command
      this.invoke( { _ctrl:{ type:[ "lupin", "AddProcessor"]}, path, proc})

      // define the command generation function and return it
      return ( parameters, source ) => {
        var signal
        if ( arguments.length > 1) {
          signal = { _ctrl: {type: path, source } }
        } else {
          signal = { _ctrl: {type: path } }
        }
        if( arguments.length) {
          Object.getOwnPropertyNames( parameters).forEach( (key) => signal[ key] = parameters[ key] )
        }  
        // call for the command
        this.invoke( signal)  // the source is the last argument
      }
    },

    
    observe( // establish and connect a state observation stream
      statePath,  // path selecting sub tree of the state for observation
      observer   // function observer( stateSubtree)  return value is ignored
    ) {
      // convert the path from "lupin.init" to ["lupin","init"] if required
      var path = (typeof statePath === 'string') ? statePath.split('.') : statePath;

      this.invoke( { _ctrl:{ type:[ "lupin", "AddObserver"]}, path, observer})
    },

    // logs are just signals in the name space 'lupin.log.[debug, error, status].level'
    log( // generate a log
      mode, // one of "debug", "status", or "error"
      source,
          /* source = {
            module, // message interface subsystem or user facing module name
            file, // optional - file name of the generating source code
            line, // optional - line numbe rin the source file
            antecedent, // internally raised events capture the prior signal source 
            timestamp  // set by the invoke call to the current date.now()
          } */
      ...args)  // anything console.log will take
    {
      this.invoke( {_ctrl: { type: [ 'lupin', 'log', mode], source}, parameters: args})
    },

    // convenience function to create a log listener
    logSubscribe(
      logFunction, // function to subscribe e.g.: console.log.bind(console)
      mode) // one of "debug", "status", or "error"
    {
      mode = mode ? "." + mode : ""
      this.command( "lupin.log" + mode, logFunction )
    }, 

    // define selected command messages to be copied to the log stream
    debugSet( 
        cmdPath, // command path to filter into the log stream
        mode) {  // one of: 'log' or 'trace' - log=once, trace=each processor invoked
      // convert the path from "lupin.init" to ["lupin","init"] if required
      var path = (typeof cmdPath === 'string') ? cmdPath.split('.') : cmdPath;
      var debug = (mode !== undefined && mode != 'trace') ? 'log' : 'trace'

      this.invoke( {_ctrl: { type: [ 'lupin', 'setDebug'], source}, path, debug } )
    },

    // discontinue logging selected command messages 
    debugClear( cmdPath ) {  // for the path specified
      // convert the path from "lupin.init" to ["lupin","init"] if required
      var path = (typeof cmdPath === 'string') ? cmdPath.split('.') : cmdPath;

      this.invoke( {_ctrl: { type: [ 'lupin', 'setDebug'], source}, path, debug: false } )
    }
  }
  return api
}

export { lupin, logPuter}
