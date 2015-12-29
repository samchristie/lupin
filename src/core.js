// lupin entry point provides stream based command managment, Immutable based state managment
import Immutable from 'immutable';  

import Most from 'most'
import bus from './bus'
import split from './split'
import { fork, partition} from './utilities'
import arrayZip from './arrayZip'

import { addProcessor, addObserver, addModule, setDebug, catcher  } from './processors'

var LupinCore
var DEBUG = 3



function funcString( proc, lines) {
  // capture the string data for a function pointer
  lines = lines ? lines : 4
  return proc.toString().split("\n", lines).reduce( (sum, line) => 
    sum +  "\n\t" + line, "")
}

function parmString( obj) {
  // capture the abbreviated string data for signal parameters
  return Object.keys( obj).reduce( 
    ( sum, key) => {
      var str 
      
      if ( key[0] == "_") return sum // skip the reserved key _values
      if ( obj[ key]) {
        if ( typeof obj[ key] == 'function') {
          str = funcString( obj[ key]) 
        } else {
          str = obj[ key].toString()
          //if ( str.length > 80 || str.split("\n").length > 4) 
          //  str = str.split("\n",4).reduce((sum, line) => sum +  "\n\t" + line, "") + "\n\t..."
        }
      }
      return sum + "\t" + key + ": " + ((str) ? str : "<undefined>") + "\n";
    }, "")
}

// function to wrap all supplied processors (including catcher and postprocessor)
function wrapProcessor( 
  sig,   // compound signal {state, signal, effects} 
  func)  // function to wrap
{
  // FUTURE: this is where debug and trace logs get created
  // get four lines of the function

  var parmStr =  parmString( sig.signal)
  parmStr = (parmStr.length) ? " with arguments: \n" + parmStr : " with no arguments.\n"

  // dump a log
  trace( sig, "\ntrace command: " + sig.signal._ctrl.type + parmStr + 
    "@processor:" + funcString( func) )

  // invoke the processor
  var results = func( sig.state, sig.signal)
  // results can contain state, signal, and effects 
  if (results.state && sig.state !== results.state) sig.state = results.state
  if (results.signal && sig.signal !== results.signal) sig.signal = results.signal
  if (results.effects) {
    if (!sig.effects) sig.effects = [];
    if (results.effects.length) {
      sig.effects = sig.effects.concat( results.effects)
    } else {
      sig.effects.push( results.effects)
    }
  }
  return sig
}

function streamTrace( // insert a tracing filter into the stream
  event$, // stream
  spot)  // tracer label
{
  return ( DEBUG >1) ? event$.map( (e) => trace(e, spot)) : event$
}

function trace( e, spot)
{
  var str
  str = e.signal._ctrl.type + ": " + spot
  if( DEBUG > 2) console.log( str) 
  e.trace = ( e.trace) ? e.trace + "\n" + str : str
  return e
}

function publicMembers( obj) { return Object.keys( obj).filter( ( key) => ( key[0] != "_") ) }

function configChildStreams ( label, labels, level, fnode, toProcess)
// set up the streams for the children of fnode which have labels
{
  var caught, processed, missed, filterset 

  // map the labels to filter predicates
  // Array.map failed disasterously in chrome
  filterset = labels.map( (name) => 
    { function f ( sig ) 
      {  var val =
            (( sig.signal._ctrl.type.length > level ) && // signal specific enough for this filter
            (sig.signal._ctrl.type[ level] == name))  // matches this key
        return val
      } 
    return f
    }  );

  [ caught, missed] = partition( toProcess, ...filterset)

  // now run the filtered streams through the children
 var tmp = arrayZip( labels, caught);
    [ processed, missed] = tmp.reduce( (sum, child) => {
      var got, rest
      var name = child[ 0]
      var event$ = child[ 1];
      
      [ got, rest] = configSignalStreams( event$, fnode[ name], name, level+1)
      return( [ sum[0].merge( got), sum[1].merge( rest)])
    }, [ Most.empty(), Most.empty()]) 

  missed = streamTrace( missed, "missed all decendents of " + label)

  return [ processed, missed]
}

function configSignalStreams( 
  // recursive function to construct the stream tree based on the filter tree supplied
  signal$, // input event stream
  ftree,   // tree of filters
  label,   // label used for debug trace
  level)   // depth in the tree - used to construct filter predicates, 0 or not supplied at _top
{
  var processed, missed, labels

  label = label || "_top"
  level = level ? level : 0
  labels = publicMembers( ftree) // who are our children
  signal$ = streamTrace( signal$, "Beginning processing for " + label)

  // execute the processors defined for this filter
  if (  ftree._processors && ftree._processors.length) {  // this level processes everything it gets
    processed = streamTrace( ftree._processors.reduce( ( stream, proc) => 
                  stream.map( ( sig) => wrapProcessor( sig, proc)), signal$), 
                    "processed by all processors of " + label) 
    missed = Most.empty()    

    if (labels.length) {
      // we have children to process stuff, set them up
      [ processed, missed] = configChildStreams( label, labels, level, ftree, processed )
      processed = process.merge( missed) 
      streamTrace( processed, "in stream after all decendents of " + label) 
    }
  } else {    // there are no local processors so we depend on the children
    signal$ = streamTrace( signal$, "no processors for " + label)
    if (labels.length) {
      // we have children to process stuff, set them up
      [ processed, missed] = configChildStreams( label, labels, level, ftree, signal$ )
      streamTrace( processed, "in stream after all decendents of " + label)
    } else {
      // no children and no processors, everything we got was missed
      processed = Most.empty()
      missed = streamTrace( signal$, "did nothing in " + label)
    }
  }

  return [ processed, missed] // return the resulting streams
}


function configStateStreams( state$, otree, label)
{
  var labels

  // define the filter and map functions for this node
  if ( label) {
    state$ = state$.filter( ( state) => state.get( label))
                .map( ( state) => 
                    { 
                      console.log( "mapping for state " + label) ; 
                      return state.get( label) 
                    })   // invoke immutable get to find name member
                .skipRepeats() 
                .multicast()
  }
  if ( otree._observers) {
    otree._observers.forEach( (proc) => { return state$.observe( (state) =>
      { console.log( "observing State" + funcString( proc, 2));
        proc( state)
     } )
      })
  }

  // if there are children, bind them to the last processor output
  labels = publicMembers( otree)
  labels.forEach( (key) => {
    var node = otree[ key]
    configStateStreams( state$, node, key)
  })
}

function configureStreams( state) {
  // find what we need in the state
  var ftree = state.get( 'signalTree').toJS()
  var otree = state.get( 'observerTree').toJS()
  var signal$ = state.get( 'signal$')

  var processed, missed

  console.log( "Configuring Streams");
  // set up all of the signal processing tree
  [ processed, missed] = configSignalStreams( signal$, ftree)
  processed = processed.map( (sig) => { console.log( "Full Trace dump:\n" + sig.trace); return sig })
  missed.map( (sig) => { throw( "Trace dump for missed stream:\n" + sig.trace); return sig })

  // create the state stream and send it through registered observers 
  var state$ = processed.map( (sig) => sig.state)
  configStateStreams( state$, otree)

  // add the default observer which ensures the whole system runs
  state$.observe( (state) => {
    console.log( "Terminal observer")
    LupinCore = state
  })  // save the current version of the state
}



// initialize Lupin core capabilities
function init( signal$, initialState ) {
  if (LupinCore) return LupinCore  // only init once

  // set up core stream environment
  let 
      // set up default starting signal filter configuration
      signalTree = { _catcher: catcher,
        lupin: {    
          AddProcessor: { _processors: [ addProcessor] },
          AddObserver: { _processors: [ addObserver] },
          AddModule: { _processors: [ addModule] }
        }
      },
      observerTree = { 
        lupin: { 
          core: { _observers: [ configureStreams] } 
        }
      },
      event$ = bus(),
      LupinCore = (initialState) ? initialState : Immutable.Map()

  signal$ = ( signal$) ? signal$.merge( event$) : event$,
  // configure main stream to include current state object with each incoming event
  signal$ = signal$.map( (sig) => { return { state: LupinCore, signal: sig} } ) 

  // fill in the initial state
  var state = Immutable.fromJS({ 
      // key streams
      event$,  // stream to raise events from the application procedural code
      signal$, // stream of all signals including from event bus and attached eventSource objects

      // trees of functions processing streams
      signalTree, // signal filter and listener tree
      observerTree  // state observer tree
  })
  
  LupinCore = LupinCore.setIn( [ 'lupin', 'core'], state)

  // set up the initial processing and observing streams
  configureStreams( state)

  // give the current state to the caller
  return LupinCore
}

export default init
