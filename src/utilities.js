// stream utilities

// function to fork an existing steam, passing missed stream to callback
function fork( stream, filter, restcb) {
  restcb( stream.filter( (e) => !filter( e)) )
  return  stream.filter( (e) => filter( e)) 
}



function partition( // Create a set of streams which partition the input across them.
  // Presumes predicate selections are mutually exclusive, returns array of streams and
  // a stream for the remainder.
  event$,  // input stream of events
  ...filters)  // list of predicates or arrays thereof
{
  var passed  // stream of events rejected by the previous filters
  var filtered // array of streams matching the filter predicates

  passed = event$ // prep for the loop
  filtered = filters.map( (filter) => fork( passed, filter, ( rest) => passed = rest))

  return [ filtered, passed]
}

export { fork, partition}