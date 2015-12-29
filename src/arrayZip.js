// arrayZip



export default function arrayZip ( // create array [[a, 1], [b,2]] from [a,b] and [1,2]; unlimited arguments
  // zipping arrays that are not the same length will produce messy results
  ...arrays)   // list of arrays to zip
{
  var length = arrays[0].length

  return arrays.reduce( ( sum, vector) => { 
    for (var row = 0; row< length; row++ ) {
      sum[ row].push( vector[ row]) 
    }
    return sum
  }, arrays[ 0].map( (row) => [ ]))  // load the initial empty column of the result array)
}

