// The control tree is a basic hierarchical object tree
// The following attributes and functions facilitate command processing
/*
signal subscriptions are kept in an object tree which might look like tree:

{
  value: {
    .... tree specific content ....
  }
  label: "_top",
  children: [
    lupin: {
      value: {
        .... tree specific content ....
      }
      label: "lupin",
      children: [
        init: {
          label: "init",
          value: {
            .... tree specific content ....
          }
        }
      ]
    }, ...
}

Signals could be internal commands, state change-events, or 
requests/commands from any external source. 

*/


// function for getting a value in the command, observer, or log control trees
function getIn( 
    tree,  // tree to find node in
    path)  //  path = ["lupin","init"] form
{
  if( !path.length) {
    // stepped down as far as the provided list, Return it.
    return tree
  }

  var name = path[ 0]
  if( tree.children !== undefined) {
    for ( var child in tree.children)) {
      if ( child.label == name) return getIn( tree.children[name], path.slice(1));
    }
  }
 // none found 
  return null
}
 

// set a value in the command, observer, or log control trees
function setIn( 
  tree,  // tree to add node to
  path,  // path = ['lupin', 'init'] form
  obj)   // object content of the node
{
  var child

  if (!path.length) {
    // at the requested node, set the value
    Object.getOwnPropertyNames( obj).forEach( (key) => tree[ key] = obj[ key] )
    return tree
  }
  var name = path[ 0]  // save the current label
  if ( tree.children !== undefined) {
    for( child in tree.children) {
      // does tree object have the subtree requested?
      if (child.label == name) {
        // navigate down a layer and repeat
        return setIn( child, path.slice(1), obj)
    }
  } else {
    tree.children = []
  }
  // found none
  tree.children.push( child = { label: name)) // create it
  return setIn( child, path.slice(1), obj)
} 


function module ( 
  name,  // the name of the module
  postprocessor,  // processor to clean up after the module signal processors
  catcher         // processor to handle unprocessed commands in this module's namespace
{
  return { label: name, postprocessor, catcher}
}


export default { getIn, SetIn, module }