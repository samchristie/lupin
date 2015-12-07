// lupin entry point provides stream based command managment, Immutable based state managment
'use strict';

import stream from 'most'
import bus from './bus'
import split from './split'

/*
Core:
  signal-stream: pluggable stream of signals
  side-stream: stream of side-effects

Processor: (state, signal) -> [state, effects]
Signal(er?): () -> signal
Detector: event -> signals
Effector: effect -> [Promise(signal)]
Renderer: state -> view
*/

function collect(acc, more) {
  return more ? (acc || []).concat(more) : acc
}


// COMMAND PROCESSING
// The following attributes and functions facilitate command processing
/*
command subscriptions are kept in an object tree which might look like this:

{
  _processors: [...],
  lupin: {
    _processors: [...],
    init: {
      _processors: [...],
    }
  },
  todo:...
}
*/


// function for getting a value in the command, observer, or log control trees
function GetNode( 
    path)  //  path = ["lupin","init"] form
{
  if( labels.length) {
    name = label[ 0]
    if (! ( name in this)) return null
    return this[name].getIn(labels.slice(1));
  }
  // stepped down as far as the provided list, Return it.
  return this
} 

// fetch the values of the entire path (top to bottom) as an array
function GetValues( 
    path, //  path = ["lupin","init"] form
    getter, // method to fetch the value of a specific node
    result) // array to hold the result
{
  if ( result === undefined ) {
    result = getter( this) 
  } else {
    result = result.concat( getter (this))
  }
  if( !path.length) return result // stepped down as far as the provided list, Return it.
  name = path[ 0]
  if (! ( name in this)) return result
  return this[name].getValues(path.slice(1), getter, result);
} 

// set a value in the command, observer, or log control trees
function SetNode( 
  path,  // path = ['lupin', 'init'] form
  value) // value passed to update to set the content of the node
{
  if (!path.length) return this.update( value) // at the resquested node, set the value
  name = path[ 0]  // save the current label
  if( !(name in this))  // does this object have the subtree requested?
    this[name] = this.commandNode( ) // no, so create it
  return this[name].setIn( path.slice(1), value)  // navigate down a layer and repeat
} 

function CommandNode( ) {// factory for a commandTree node
  return {
    processors: [],
    getIn: GetNode,
    setIn: SetNode,
    getValues: GetValues,
    commandNode: CommandNode,
    update: function( proc) { this.processors.push( proc); return this }
  }
}
/*
// subscribe this processor to the command set
function addProcessor( 
    procTree,  // the tree of subscribed processors 
    path, // an array of the labels in the signal type
    proc) // function to subscribe as the processor
{
  var cmdNode = procTree; 
  for (var depth = 0; depth < path.length; depth++) {
    // march through the command type path
    if( !(path[ depth] in cmdNode)) {
      // missing next layer of subscribers, add it
      cmdNode[ path[ depth]] = {_processors: []};
    }
    cmdNode = cmdNode[ path [depth]]  // step down to the next level
  }
  cmdNode._processors.push( proc)  // add this proc at this level
}


function fetchProcessors( // find all of the processors subscribed to the event; return [ processor, ...]
    procTree,  // the tree of subscribed processors to search
    type,  // an array of the labels in the signal type  e.g.: "lupin.init" -> ["lupin", "init"] 
  ) {
  var cmdNode = procTree; 
  var procs = cmdNode._processors;  // grab the subscribers to all commmands

  for (var depth = 0; depth < type.length; depth++) {
    // march through the command type path
    if( type[ depth] in cmdNode) {
      // found the next layer of subscribers, go get'em
      cmdNode = cmdNode[ type[ depth]];
      procs = procs.concat( cmdNode._processors);
    } else {
      break;
    }
  }
  return procs;
}
*/
function processSignal(processorTree) {
  return function([state], signal) {
//    var procs = fetchProcessors( processorTree, signal._ctrl.type);
    var procs = processorTree.getValues( signal._ctrl.type, (node) => node.processors )
    return procs.reduce(
      ([state, effects], proc) => {
        let [s, e] = proc(state, signal),
            res = [ s, collect(effects, e) ]
        return res
      }, [state])
  }
}




function processEffect(effect, effectors) {
  return stream.from(effectors)
    .map(f => f(effect))
    .chain(l => stream.from(l))
    .map(i => Promise.resolve(i))
    .await()
}

// convenience function to create a source object. Really just documentation of possible attribute names
function eventSource(
    type, // one of "user", "message", "antecedent", "bootstrap"    
    module, // message interface subsystem or user facing module name
    label, // optional - additional identifiers such as connection or UI control
    file, // optional - file name of the generating source code
    line, // optional - line numbe rin the source file
    antecedent, // optional, used for internally raised events to capture the prior signal source 
    timestamp  // set by the invoke call to the current date.now()
  ) {
  return { type, module, label, sourcefile, linenumber, antecedent, timestamp }
}

// convert the path ["lupin","init"] to "lupin.init"
function pathString ( path) { 
 return path.join('.')
}

function loadState(state, signal) {
  return [signal.state]
}

var LupinCore


function Lupin(initialState) {
  if( LupinCore !== undefined ) return LupinCore;

  let cmdProcessors = CommandNode( ),
      effectors = [],
      signals = bus(),
      merged = signals.scan(processSignal(cmdProcessors),
                            [initialState]),
      [state, effects] = split(merged),
      logStream = signals.filter( (signal) => { 
        return ( signal._ctrl.type[0]=='lupin' && signal._ctrl.type[1]=='log' )
      }),
      observers = { _stream: state }, // observer tree is similar to the processor tree but 
                                // holding filtered streams instead of proc pointers
      LupinCore = {
        cmdProcessors, signals, state, effectors, logStream, observers,
        effects: effects
          .filter(e => e !== undefined)
          .chain(l => stream.from(l))
          .multicast(),


        load(state) {
          source = { 
            type:"bootstrap", 
            module: "lupin",
            file: "lupin.js",
            line: 170
          }
          this.invoke( {_ctrl: { type: 'lupin.load', source}, state})
        },

        // construct a method to invoke a new command
        command( // creat the command invocation function. Returns the function.
          cmdPath, // full pathname of the command which this function will invoke
                    // can be either a string delimited with '.' or an array of strings
                    //  e.g.: "lupin.init" or ["lupin", "init"]
          processor) // function to be invoked to execute on the subscribed command set
                     // this function must fit the signature 
                     // processor( state, command) -> [ state, effect, ...]]
         {

          var path = (typeof cmdPath === 'string') ? cmdPath.split('.') : cmdPath;

          // subscribe the processor to this command
//          addProcessor(this.cmdProcessors, path, processor);
          cmdProcessors.setIn( path, processor);
          
          // define the command generation function and return it
          return ( parameters, source ) => {
            var signal
            if ( arguments.length > 1) {
              signal = Object.assign( { _ctrl: {type: path, source } }, parameters);
            } else {
              signal = Object.assign({ _ctrl: {type: path } }, parameters);
            }

            // call for the command
            this.invoke( signal)  // the source is the last argument
          }
        },

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
              throw { file: "lupin", line: 213, message: "Invalid command object at invoke." }
          } 

          if( arguments.length > 1) {
            cmd._ctrl.source = source;
          } else if (cmd._ctrl.source === undefined ) {
            cmd._ctrl.source = {};
          }
          cmd._ctrl.source.timestamp = Date.now();
          // actual most call to emmit the command to the stream
          this.signals.push( cmd);  
        },

        observe( // establish and connect a state observation stream
          statePath,  // path selecting sub tree of the state for observation
          observer   // function observer( stateSubtree)  return value is ignored
        ) {
          var path = (typeof statePath === 'string') ? statePath.split('.') : statePath;

          var stateNode = this.observers; 
          for (var depth = 0; depth < path.length; depth++) {
            // march through the state tree path
            var name = path[ depth]
            if( !(name in stateNode)) {
              // missing next layer of subscribers

              // create a stream for it      
              var newStream = stateNode._stream
                .map( ( state )=> state.get( name))  // invoke immutable get to find name member
                .skipRepeats() 
                .multicast()
              // create the next level node and insert our new stream
              stateNode[ name] = { _stream: newStream }
            } 
            stateNode = stateNode[ name]  // step down to the next level
          }
          // add this proc at this level
          stateNode._stream.observe( observer)
        },

        // logs are just signals in the name space 'lupin.log.[debug, error, status].level'
        log( // generate a log
          mode, // one of "debug", "status", or "error"
          level, // a positive integer, 0 < level < 6
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
          this.invoke( {_ctrl: { type: [ 'lupin', 'log', mode, level], source}, parameters: args})
        },

        debugSet(  // define the command messages which will be pushed to the log stream
          cmdpath, // command path to filter
          level)  // debug level for these logs
        {

        },

        debugClear(  // discontinue logging command messages 
          cmdPath )   // for the path specified
        {

        }
      },

      processedEffects = LupinCore.effects.chain(e => processEffect(e, effectors))

  LupinCore.signals.plug(processedEffects)
  LupinCore.command('lupin.load', loadState)
  return LupinCore;
}

export default Lupin
export {Lupin, stream}
