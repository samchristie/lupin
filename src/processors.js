

function addModule( state, signal)
{
  state = state.updateIn( ["lupin", "core", "signalTree"].
    concat( signal.path), {}, ( node) => {
      node._postprocessor = signal.postprocessor
      node._catcher = signal.catcher 
      return node
  })
  return { state }
}

function addProcessor( state, signal)
{
  state = state.updateIn( ["lupin", "core", "signalTree"].
    concat( signal.path), {}, ( node) => {
      if( node._processors) {
        node._processors.push( signal.proc)
      } else {
        node._processors = [ signal.proc]        
      }
      return node
  })
  return { state }
}

function addObserver( state, signal)
{
  state = state.updateIn( ["lupin", "core", "observerTree"].
    concat( signal.path), {}, ( node) => {
      if (node._observers) { 
        node._observers.push( signal.observer) 
      } else {
        node._observers = [ signal.observer]
      } 
      return node
  })
  return { state }
}

function setDebug( state, signal)
// lupin runs this to catch any signal not run through a processor
{ 
  state = state.updateIn( ["lupin", "core", "signalTree"].
      concat( signal.path, 'debug'), {}, ( node) => {
        node.debug = signal.debug
        return node
  })
  return { state }
}

function catcher( state, signal)
// default signal catcher, log all unprocessed signals, if no log hander, throw an exception
{
  if( signal._ctrl.type[0] == 'lupin' && signal._ctrl.type[1] == 'log') {
    // there is no log filter assigned and a log was sent - oops
    throw "Missing log filter in lupin configuration. Logging caught: " + 
      JSON.stringify( signal.parameters)
  }
  var event$ = state.getIn( ['lupin', 'core', 'event$'] )
  // create a log
  event$.push( {
    _ctrl: { 
      type: [ 'lupin', 'log', 'debug'],  // should this be 'debug', 'status', or 'error' ????
      labels: [ 'lupin', 'log', 'debug'],
      source: {
        type: "antecedent",
        //stacktrace data should go here
        antecedent: signal._ctrl.source,
        timestamp: Date.now()
      }      
    }, 
    parameters: ["uncaught command invoked: " + signal._ctrl.labels]
  })

  return { state, signal}
}

export { addProcessor, addObserver, addModule, setDebug, catcher  }