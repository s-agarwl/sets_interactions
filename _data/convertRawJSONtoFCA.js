function convertRawJSONtoFCA()
{
    var rawJSON = window.techCompaniesRawJSON;
    var setNamesSet = new Set();
    var elementNamesSet = new Set();
    var timestepsSet = new Set();

    for(var timestep in rawJSON.memberships)
    {
        timestepsSet.add(timestep);
        for(var element in rawJSON.memberships[timestep])
        {
            elementNamesSet.add(element);
            for(var set of rawJSON.memberships[timestep][element].sets)
                setNamesSet.add(set);
            
        }
    }
    // console.log(Array.from(setNamesSet));

    // makestring
    // var rowHeader = Array.from(setNamesSet);
    var rowHeader = ["Search Engine", "Gaming Console", "Operating System", "Social Network", "Telecommunications", "eCommerce"];

    // Filter elements present only in the specified sets
    var elementNamesSet = new Set();
    var timestepsSet = new Set();

    for(var timestep in rawJSON.memberships)
    {
        for(var element in rawJSON.memberships[timestep])
        {

            for(var set of rawJSON.memberships[timestep][element].sets)
                if(rowHeader.indexOf(set)>=0)
                    elementNamesSet.add(element);
        }
    }
    for(var timestep in rawJSON.memberships)
    {
        for(var element in rawJSON.memberships[timestep])
        {
            if(!elementNamesSet.has(element))
            {
                delete rawJSON.memberships[timestep][element];
            }
        }
    }

    var stringData = [];

    for(var year in rawJSON.memberships)
    {
        // var stringTime="\"" + year + "\":";
        var stringArray = [[""]];
        var stringDictionary = {};
        for(var rowLabel of rowHeader)
        {
            stringArray.push([rowLabel+""]);
        }
        for(var element in rawJSON.memberships[year])
        {
            stringArray[0] += ","+element;
            for(var i=1; i<stringArray.length; i++)
            {
                if(rawJSON.memberships[year][element].sets.indexOf(rowHeader[i-1]) >=0)
                    stringArray[i] += ",1";
                else
                stringArray[i] += ",0";
            }
        }
        var concatenatedString ="";

        for(var i=0; i<stringArray.length; i++)
        {
            stringArray[i] += "&&&";
            concatenatedString += stringArray[i];
        }
        stringDictionary[year] = concatenatedString;
        stringData.push(stringDictionary);
    }

    // console.log(JSON.stringify(interactionHyperEdges));
    // console.log(stringData);
    console.log(JSON.stringify(stringData));

    // Convert timestep in edges
    for(var edge of rawJSON.interactions)
    {
           var yearMatchesTimestep = false;
        timestepsSet.forEach((timestepString) =>{
            var responseDict = yearBelongsInTimestep(edge.year, timestepString);
            if( responseDict.belongs)
            {
                edge.year = responseDict.timestepLabel;
            }
        })
        if(!yearBelongsInTimestep) console.log("Year in edge cannot be mapped to any timestep label" + edge+ timestepsSet);
    }
    // console.log(JSON.stringify(rawJSON));

}

function yearBelongsInTimestep(year, timestepString)
{
    var response = {"belongs": false, "timestepLabel": -1};
    if(year == timestepString)
    {
        response.belongs = true;
        response.timestepLabel = year;
        return response;
    }
    else if(timestepString.includes("-"))
    {
        var timestepsArray = timestepString.split("-");
        for(var t of timestepsArray)
             t = parseInt(t);
        if(year >= timestepsArray[0] && year <= timestepsArray[1])
        {
            response.belongs = true;
            response.timestepLabel = timestepString;
            return response;
        }
    }
    return response;

}