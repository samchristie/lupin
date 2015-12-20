// lupin entry point provides stream based command managment, Immutable based state managment
'use strict';

import stream from 'most'
import bus from './bus'
import split from './split'

import './controlTree'

// define lupin core signal processors 
function loadState( state, signal) {
  return [ signal.state, signal]
}


// lupin runs this to catch any signal not run through a processor
function catcher( state, signal)
{
  var event$ = state.getIn( ['lupin', 'core', 'events'] )
  // create a log
  event$.push( {
    _ctrl: { 
      type: [ 'lupin', 'log', 'debug'],  // should this be 'debug', 'status', or 'error' ????
      source: {
        type: "antecedent",
        //stacktrace data should go here
        antecedent: signal._ctrl.source
        timestamp: Date.now()
      }
    }, 
    parameters: [state, signal]
  })
}


// function to fork an existing steam
function fork( stream, filter, map, cb) {
  cb( stream.filter( (e) => !filter( e)))
  return stream.filter( filter).map( map)
}


function configSignalStreams( signal$, ftree)
  var caught, processed, missed

  ftree.children.forEach( ( node) => {
    // define the filter and map functions for this node
    filter = ( sig) => sig._ctrl.type[0] == node.label
    map = ( sig) => { sig._ctrl.type = sig._ctrl.type.slice(1); return sig }

    // filter and map the incoming stream, capture what is left in stream for the next peer
    caught = signal$.fork( filter, map, ( rest) => missed = rest)

    processed = caught  // not really, but pretend so we can start the loop
    if (node.processors ) {
      // module nodes have no defined processors
      node.processors.forEach( (proc) => {
        // pipe the filtered/mapped signals through the sequence of processors
        processed = processed.map( ( state, signal) =>
          // lupin wrapper function for processors 
          return( proc( signal.state, signal.arguments))
          )
      }) 
    }

    if ( node.children  && node.children.length) {
      // if there are children, bind them to the last processor output
      [ processed, rest] = configureSignalStreams( processed, node)
      // merge any unhandled messages back in
      if( !node.processors || !node.processors.length) {
        // don't mark missed any stream that has been processed at this level
        missed = (missed ) ? rest : missed.merge( rest)
      }
    }

    if (node.postprocessor ) processed = processed.map( node.postprocessor )
    if (node.catcher ) {
      processed = processed.merge( missed.map( node.postprocessor ))
      missed = most.empty()    
  })
  return [ processed, missed] // return the resulting streams
}

function configStateStreams( state$, ftree)
  ftree.children.forEach( ( node) => {
    // define the filter and map functions for this node
    filter = ( state) => state.get( node.label)
    map = ( state) => state.get( label))  // invoke immutable get to find name member
                .skipRepeats() 
                .multicast()

    state$ = state$.filter( filter).map( map)

    if (node.observers !== undefined) {
      // module nodes have no defined processors
      node.observers.forEach( (proc) => state$.observe( proc) )
    }

    if ( node.children && node.children.length) {
      // if there are children, bind them to the last processor output
      configureStateStreams( state$, node)
    }
  })
}

function configureStreams( state) {
  var ftree = state.get(  ['signalTree']).toJS()
  var otree = state.get( ['observerTree']).toJS()
  var signal$ = state.getIn( ['signal$']

  var processed, missed
  [ processed, missed] = configureSignalStreams( signal$, ftree)

    
}




// initialize Lupin core capabilities
function init( signal$, initialState ) {
  // set up core stream environment
  let 
      // set up default starting signal filter configuration
      signalTree = {
        label: '_top', scubber: scrubber, catcher, children: 
        [
          { label: 'lupin', children:   // lupin itself uses the default scrubber and catcher
            [ 
              { label: 'log', children: 
                [
                  { label: 'debug', listeners: []}, 
                  { label: 'status', listeners: []}, 
                  { label: 'error', listeners: []} 
                ] },
              { label: 'command', processors: [ loadProcessors] },
              { label: 'load', processors: [ loadState]}
            ]
          }
        ]
      },
      observerTree = { label: '_top'},
      event$ = bus(),
      signal$ = ( signal$ === undefined ) ? event$ : signal$.merge( event$),
      state = (initialState === undefined) ? Immutable.Map() : initialState

  // set up default starting observer configuration
  observerTree = setIn( observerTree, ['lupin', 'core' ], configureStreams)

  // fill in the initial state
  state = state.setIn( [ 'lupin', 'core'], 
    Immutable.fromJS({ 
      // key streams
      event$,  // stream to raise events from the application procedural code
      signal$, // stream of all signals including from event bus and attached eventSource objects

      // trees of functions processing streams
      signalTree, // signal filter and listener tree
      observerTree  // state observer tree
    })
  )
  // Load the initial state for Lupin
   event$.push( {
    _ctrl: { 
      type: [ 'lupin', 'load'],
      source: {
        type: "bootstrap",
        // stacktrace data should go here
        timestamp: Date.now()
      }
    }, 
    parameters: { state }
  )

  // give the event bus and state stream handles to the caller
  return { event$, state$ }
}

export default init
