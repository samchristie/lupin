
// manage observer tree
import  { GetNode, SetNode, GetValues } from './controlTree'


function ObserverNode( // factory for a observerTree node
    label,  // portion of the path
    parent) // preceding node in the tree (to access preceding stream
{
  var state$ = (parent === undefined) ? null : parent.value.state$
                .map( ( state )=> state.get( label))  // invoke immutable get to find name member
                .skipRepeats() 
                .multicast()
  return {
    label,
    state$
    children: [],
    getIn: GetNode,
    setIn: SetNode,
    getValues: GetValues,
    newNode: ObserverNode
  }
}

export default ObserverNode