function DynaSet() {
  // User interface parameters.
  guiParams = {
    shape: "circle", // "square" or "circle" --square shape has problems in diff view
    mainVisHeight: 50,
    previewWidth: 80, // When editing, be sure to update CSS values t0o.
    previewHeight: 40,
    previewMargin: 5,
    previewBorder: 1,
    selectionBarHeight: 25,
    authorEvolutionSvgBarsHeight: 8,
    authorEvolutionSvgBarsPadding: 1,
    authorListRowHeight: 30,
    authorListSvgWidth: 50,
    authorEvolutionLegendHeight: 20,
    authorTimelineBarColor: "black",
    authorTimelineWidth: 70,
    highlightColor: "#f9ba02",
    highlightOpacity: 0.3,
    defaultSorting: "degree",
    fontSize: 15,
    setMatrixEndX: 200 + 18,
    nodeBarWidth: 10,
    hyperEdgeCircleRadius: 3,
    interactionEdgeOpacity: 0.8,
    widthOfOneZone_Min: 150,
    // widthOfOneZone_Min: 350,
    additionalHeight: 10,
    numOfRowsonMouseOver: 5,
  };
  window.filenames = [];
  var weightThreshold;
  visParams = {
    conceptWidth: 200,
    conceptMargin: 10,
    dummyWidth: 5,
    dummyMargin: 3,
  };
  window.sets = {};
  window.selectedGroups = {};

  /* public functions */

  vis.loadHarcodedDatasetFromJavascriptObject = function (datasetId) {
    window.edgeThicknessScale = undefined;
    window.selectedTimestepForSorting = undefined;
    const dataset = window.datasets[datasetId].data;

    if (datasetSelection.currentLoadedDatasetIndex == 7)
      window.paperDetailsPresent = true;
    else window.paperDetailsPresent = false;

    var lattices = [];
    window.filenames = [];
    var filesRead = 0;
    dataObjectKeys = [];
    window.inputRawData = [];
    window.sethashandNameDict = {};
    window.degreeDictionary = {}; //Degree is key
    window.selectedConceptIdForHighlight = [];
    window.maxObjectsInAnyDegree = undefined;
    window.allObjectsInfo = {};
    window.allObjectsInfo_Reverse = {};

    $("#showExclusive").prop("checked", false);

    for (var i = 0; i < dataset.length; i++) {
      dataObjectKeys.push(Object.keys(dataset[i])[0]);
    }
    for (var index = 0; index < dataObjectKeys.length; index++) {
      var file = dataObjectKeys[index];
      var reader = new FileReader();
      var content = dataset[index][dataObjectKeys[index]];
      // Parse the context and construct a lattice for this file.
      var inputContext = parseContextFromCsv(content.replace(/&&&/g, "\r\n"));
      window.sets = inputContext.attributes;
      var separatedContext = separateExclusiveElements(inputContext);
      window.inputRawData.push(separatedContext);
      var inputLattice = performFcaOnContext(inputContext);
      var version = Math.pow(2, index);
      lattices[index] = convertInputToLattice(inputLattice, version);
      // computeNodeFilteringMetric(lattices[index]);

      window.filenames[index] = dataObjectKeys[index];
      filesRead++;
      if (filesRead == dataObjectKeys.length) {
        // All files have been read, proceed to processing the lattices and
        // constructing the UI.
        // Aggregate all the single lattices.
        window.maxNumOfObjectsInAnyConcept =
          calculateMaxObjectsInConcept(lattices);

        var aggregatedLattice = lattices[0];
        for (var tempindex = 1; tempindex < lattices.length; tempindex++) {
          var currentLattice = lattices[tempindex];
          addLatticeBtoLatticeA(aggregatedLattice, currentLattice);
        }
        computeLatticeLayout(aggregatedLattice);
        // computeNodeFilteringMetric(aggregatedLattice);
        computeTransitiveRelations(aggregatedLattice);
        var versions = d3.range(0, lattices.length).map(function (x) {
          return Math.pow(2, x);
        });
        // (Re)construct the UI.
        createCopyOfFullName(aggregatedLattice);
        window.allConceptNames = conceptNames(aggregatedLattice);
        // window.allConceptHashs = Object.keys(aggregatedLattice.concepts);
        window.numberOftimesteps = lattices.length;
        window.timeLineDataForConcepts = computeTimeLineData(
          aggregatedLattice,
          lattices,
          versions
        );
        window.timeLineDataForObjects =
          calculateObjectTimelineData(aggregatedLattice);
        window.numObjectsOverTime = calculateObjectsOverTime(
          aggregatedLattice,
          lattices,
          versions
        );
        deconstructGui();

        var numObjects = Object.keys(timeLineDataForObjects).length;
        if ("0" in timeLineDataForObjects) numObjects--;
        d3.selectAll("#numObjects").text(numObjects);
        d3.selectAll("#numTimesteps").text(versions.length);
        // d3.selectAll("#numIntersections").text(Object.keys(aggregatedLattice.concepts).length);

        d3.select("#datasetInformation").html(
          window.datasets[datasetId].description
        );

        window.numSets = degreeDictionary["1"].length;
        window.degreesAggregated = [-1];
        for (var i = 1; i <= numSets; i++) window.degreesAggregated.push(0);

        window.sortBy = guiParams.defaultSorting; //degree, stability, similarity, timestep, cumulative

        computeGraphStructure();
        computeGraphLayout();
        createElementList();

        var numIntersections = 0;
        for (var deg in window.degreeDictionary) {
          numIntersections += window.degreeDictionary[deg].length;
        }
        d3.selectAll("#numIntersections").text(numIntersections);

        // populateAdditionalAttributeArea();
      }
    }

    return this;
  };

  vis.updateQuery = function (group, operator, sets, timestep, degree) {
    if (sets.length > 0 || operator == "k-set intersections") {
      let aggregatedSetElements = [];
      switch (operator) {
        case "union":
          aggregatedSetElements = unionSetList(sets, timestep);
          break;
        case "intersection":
          aggregatedSetElements = intersectionSetList(sets, timestep);
          break;
        case "exclusive intersection":
          intersectionElements = intersectionSetList(sets, timestep);
          const otherSets = minus(vis.getBaseSetNames(), sets);
          otherElements = unionSetList(otherSets, timestep);
          aggregatedSetElements = minus(intersectionElements, otherElements);
          break;
        case "k-set intersections":
          aggregatedSetElements = aggregatedIntersections(degree, timestep);
      }
      window.selectedGroups[group] = aggregatedSetElements;
    } else {
      window.selectedGroups[group] = [];
    }
    updateSelectedGroupEdges();
    computeAndDrawGroupEdges(window.selectedElement, "0");
    createElementList();
  };

  vis.updateEdgeQuery = function (group, objects) {
    var objectids = [];
    for (var i = 0; i < objects.length; i++) {
      objectids.push(objects[i].objectid);
    }
    window.selectedGroups[group] = objectids;
    updateSelectedGroupEdges();
    createElementList();
  };

  vis.getBaseSetNames = function () {
    return Object.values(window.sets).map((set) => set.name);
  };

  vis.getTimesteps = function () {
    return Object.keys(timeLabelToIndexDictionary);
  };

  /* private functions */

  function getSetElements(setName, timestep) {
    const timestepIndex = timeLabelToIndexDictionary[timestep];
    const setHash = parseInt(setNameToHashDictionary[setName]);
    return inputRawData[timestepIndex][setHash].allElementIds;
  }

  function createCopyOfFullName(lattice) {
    var conceptKeys = Object.keys(lattice.concepts);
    for (var i = 0; i < conceptKeys.length; i++) {
      lattice.concepts[conceptKeys[i]].copyOfFullName =
        lattice.concepts[conceptKeys[i]].fullName;
    }
  }

  function vis() {
    return this;
  }

  function separateExclusiveElements(inputContext) {
    if ("0" in inputContext.objects) {
      delete inputContext.objects["0"];
    }
    if (0 in inputContext.attributes) {
      delete inputContext.attributes["0"];
    }
    var separatedContext = {};

    var attributeArray = Object.keys(inputContext.attributes);
    for (var i = 0; i < attributeArray.length; i++) {
      separatedContext[attributeArray[i]] = {
        exclusive: [],
        shared: [],
        degree: 1,
      };
      sethashandNameDict[attributeArray[i]] =
        inputContext.attributes[attributeArray[i]].name;

      if ("1" in degreeDictionary) {
        if (degreeDictionary["1"].indexOf(parseInt(attributeArray[i])) < 0)
          degreeDictionary["1"].push(parseInt(attributeArray[i]));
      } else degreeDictionary["1"] = [parseInt(attributeArray[i])];
    }
    var objectArray = Object.keys(inputContext.objects);

    for (var i = 0; i < objectArray.length; i++) {
      var belongingAttributes = inputContext.objects[objectArray[i]].attributes;
      if (belongingAttributes.length == 1) {
        separatedContext[belongingAttributes[0]]["exclusive"].push({
          objectid: objectArray[i],
          weight: inputContext.objects[objectArray[i]].weights[0],
        });
      } else if (belongingAttributes.length > 1) {
        for (var l = 0; l < belongingAttributes.length; l++) {
          separatedContext[belongingAttributes[l]]["shared"].push({
            objectid: objectArray[i],
          });
        }

        var tempsortedattrs = belongingAttributes.sort();
        var tempSetName = "";
        for (var x = 0; x < tempsortedattrs.length; x++) {
          tempSetName += sethashandNameDict[tempsortedattrs[x]] + ",";
        }
        var temphash = hash(tempSetName);
        sethashandNameDict[temphash] = tempSetName;

        if (temphash in separatedContext) {
          var tempweight = calculateWeight(
            inputContext.objects[objectArray[i]].weights
          );
          separatedContext[temphash]["exclusive"].push({
            objectid: objectArray[i],
            weight: tempweight,
          });
        } else {
          var tempweight = calculateWeight(
            inputContext.objects[objectArray[i]].weights
          );
          separatedContext[temphash] = {
            exclusive: [{ objectid: objectArray[i], weight: tempweight }],
            shared: [],
            degree: tempsortedattrs.length,
          };
          if (tempsortedattrs.length in degreeDictionary) {
            if (degreeDictionary[tempsortedattrs.length].indexOf(temphash) < 0)
              degreeDictionary[tempsortedattrs.length].push(temphash);
          } else degreeDictionary[tempsortedattrs.length] = [temphash];
        }
      }
    }

    // update objectInfo
    for (var i = 0; i < objectArray.length; i++) {
      if (!(objectArray[i] in allObjectsInfo)) {
        allObjectsInfo[objectArray[i]] = {
          name: inputContext.objects[objectArray[i]].name,
        };
        allObjectsInfo_Reverse[inputContext.objects[objectArray[i]].name] =
          objectArray[i];
      }
    }

    separatedContext["added"] = [];
    separatedContext["removed"] = [];
    return separatedContext;
  }

  function calculateWeight(weightsArray) {
    var returnweight = 0;
    for (var i = 0; i < weightsArray.length; i++)
      returnweight += weightsArray[i];
    return returnweight;
  }

  function computeGraphStructure() {
    window.nodes = {};
    window.edges = [];
    window.interactionEdges = [];
    window.edgeIdCounter = 0;

    for (var i = 0; i < inputRawData.length; i++) {
      var nodesArray = Object.keys(inputRawData[i]);
      for (var j = 0; j < nodesArray.length; j++) {
        var wt = 0;
        if (nodesArray[j] != "added" && nodesArray[j] != "removed")
          wt = inputRawData[i][nodesArray[j]]["exclusive"].length;
        else wt = 0;

        nodes["T" + i + "N" + nodesArray[j]] = {
          nodeId: "T" + i + "N" + nodesArray[j],
          setid: +nodesArray[j],
          timestep: i,
          degree: inputRawData[i][nodesArray[j]]["degree"],
          weight: wt,
          // "validNode":true
        };
      }
    }

    for (var i = 0; i < inputRawData.length - 1; i++) {
      var nodesArray = Object.keys(inputRawData[i]);

      for (var j = 0; j < nodesArray.length; j++) {
        if (nodesArray[j] != "added" && nodesArray[j] != "removed") {
          var tempobjects = copy(inputRawData[i][nodesArray[j]].exclusive);
          for (var k = 0; k < tempobjects.length; k++) {
            var nextPresenceOfObject = findNextPresenceOfObject(
              tempobjects[k],
              i
            );
            if (nextPresenceOfObject == 0) {
              edges.push({
                from: "T" + i + "N" + nodesArray[j],
                to: "T" + i + "N" + "removed",
                fromTimestep: i,
                toTimestep: i,
                objects: [tempobjects[k]],
              });
            } else {
              // console.log(nextPresenceOfObject);
              edges.push({
                from: "T" + i + "N" + nodesArray[j],
                to: nextPresenceOfObject.nodeId,
                fromTimestep: i,
                toTimestep: nextPresenceOfObject.timestep,
                objects: [tempobjects[k]],
              });
            }

            var previousPresenceOfObject = findPreviousPresenceOfObject(
              tempobjects[k],
              i
            );
            if (previousPresenceOfObject == 0 && i > 0) {
              edges.push({
                from: "T" + i + "N" + "added",
                to: "T" + i + "N" + nodesArray[j],
                fromTimestep: i,
                toTimestep: i,
                objects: [tempobjects[k]],
              });
            }
          }
        }
      }
    }

    // Merge edges with same origin and destination

    for (var i = 0; i < edges.length; i++) {
      for (var j = 0; j < edges.length; ) {
        if (
          i != j &&
          edges[i].from === edges[j].from &&
          edges[i].to === edges[j].to
        ) {
          edges[i].objects = edges[i].objects.concat(edges[j].objects);
          edges.splice(j, 1);
        } else j++;
      }
    }
    for (var i = 0; i < edges.length; i++) {
      edges[i]["id"] = "e" + edgeIdCounter;
      edgeIdCounter++;
    }
    if (window.currentDatasetId == "tech")
      window.interactionEdges = computeInteractionEdgesTech();
    else if (window.currentDatasetId == "csresearch")
      window.interactionEdges = computeInteractionEdges();

    // check if any degree is aggregated and then call computeaggregatedgraphstructure()
    if (window.degreesAggregated.indexOf(1) >= 0) {
      computeAggregatedGraphStructure();
    }
  }

  function computeInteractionEdges() {
    var tempInteractionEdges = [];

    for (var index in window.interactionHyperEdges) {
      var e = window.interactionHyperEdges[index];
      var timestep = e.timestep;
      var hyperedgeSet = new Set();
      var nodesElementDictionary = {};
      var authorsArray = [];
      if (e.authors.length < 2)
        console.log("The hyperedge has less than two authors:", e);
      else {
        for (var author of e.authors) {
          var authorId = allObjectsInfo_Reverse[author];
          for (var conceptid in inputRawData[timestep]) {
            var concept = inputRawData[timestep][conceptid];
            if (conceptid != "added" && conceptid != "removed") {
              if (concept.exclusive.length > 0) {
                for (var t in concept.exclusive) {
                  exclusiveobj = concept.exclusive[t];
                  if (exclusiveobj.objectid == authorId) {
                    hyperedgeSet.add(conceptid);
                    authorsArray.push(author);
                    if (conceptid in nodesElementDictionary) {
                      if (nodesElementDictionary[conceptid].indexOf(author) < 0)
                        nodesElementDictionary[conceptid].push(author);
                    } else {
                      nodesElementDictionary[conceptid] = [author];
                    }
                  }
                }
              }
            }
          }
        }
      }
      var tempEdge = {
        nodes: hyperedgeSet,
        nodesElementDictionaryArray: nodesElementDictionary,
        timestep: timestep,
        authors: authorsArray,
        title: e.title,
      };
      if (authorsArray.length == 0) {
        console.log("Empty computed authors", e);
      }
      tempInteractionEdges.push(tempEdge);
    }

    // merge interaction edges between same same origin and destinations
    var interactionEdges_Merged = [];
    for (var i = 0; i < tempInteractionEdges.length; i++) {
      var e1 = tempInteractionEdges[i];
      var duplicateFound = false;
      for (var j = 0; j < interactionEdges_Merged.length; j++) {
        var e2 = interactionEdges_Merged[j];
        if (setsAreEqual(e1.nodes, e2.nodes) && e1.timestep == e2.timestep) {
          duplicateFound = true;
          interactionEdges_Merged[j]["authors"].push(e1["authors"]);
          interactionEdges_Merged[j]["title"].push(e1["title"]);
          interactionEdges_Merged[j]["nodesElementDictionaryArray"].push(
            e1["nodesElementDictionaryArray"]
          );
          interactionEdges_Merged[j]["count"] = e2["count"] + 1;
        }
      }
      if (!duplicateFound) {
        interactionEdges_Merged.push({
          nodes: e1.nodes,
          timestep: e1.timestep,
          authors: new Array(e1["authors"]),
          nodesElementDictionaryArray: new Array(
            e1.nodesElementDictionaryArray
          ),
          title: new Array(e1["title"]),
          count: 1,
        });
      }
    }

    // count excluding self-loop
    var nonSelfLoopEdgeCount = 0;
    var selfLoopEdgeCount = 0;
    for (var e of interactionEdges_Merged) {
      if (e.nodes.size > 1) nonSelfLoopEdgeCount++;
      else if (e.nodes.size == 1) selfLoopEdgeCount++;
    }
    console.log(
      "Number of interaction edges excluding self-loop: ",
      nonSelfLoopEdgeCount
    );
    console.log("Number of intra-group interaction edges: ", selfLoopEdgeCount);
    console.log(
      "Total number of interactions: ",
      nonSelfLoopEdgeCount + selfLoopEdgeCount
    );

    return interactionEdges_Merged;
  }

  function computeInteractionEdgesTech() {
    var tempInteractionEdges = [];
    var rawEdges = window.techCompaniesRawJSON.interactions;
    var timestepArray = [
      "1990-1994",
      "1995-1999",
      "2000-2004",
      "2005-2009",
      "2010-2014",
      "2015-2019",
      "2020-2023",
    ];
    for (var index in rawEdges) {
      var e = rawEdges[index];
      e.timestep = timestepArray.indexOf(e.year);
      var timestep = e.timestep;
      var hyperedgeSet = new Set();
      var nodesElementDictionary = {};
      var elementsArray = [];
      if (e.elements.length < 2)
        console.log("The hyperedge has less than two elements:", e);
      else {
        for (var element of e.elements) {
          var elementId = allObjectsInfo_Reverse[element];
          for (var conceptid in inputRawData[timestep]) {
            var concept = inputRawData[timestep][conceptid];
            if (conceptid != "added" && conceptid != "removed") {
              if (concept.exclusive.length > 0) {
                for (var t in concept.exclusive) {
                  exclusiveobj = concept.exclusive[t];
                  if (exclusiveobj.objectid == elementId) {
                    hyperedgeSet.add(conceptid);
                    elementsArray.push(element);
                    if (conceptid in nodesElementDictionary) {
                      if (
                        nodesElementDictionary[conceptid].indexOf(element) < 0
                      )
                        nodesElementDictionary[conceptid].push(element);
                    } else {
                      nodesElementDictionary[conceptid] = [element];
                    }
                  }
                }
              }
            }
          }
        }
      }
      var tempEdge = {
        nodes: hyperedgeSet,
        nodesElementDictionaryArray: nodesElementDictionary,
        timestep: timestep,
        authors: elementsArray,
        title: e.details,
        link: e.link,
      };
      if (elementsArray.length == 0) {
        console.log("Empty computed authors", e);
      }
      tempInteractionEdges.push(tempEdge);
    }

    // remove empty edges
    var temp2InteractionEdges = [];
    for (var edge of tempInteractionEdges) {
      if (edge.nodes.size > 0) temp2InteractionEdges.push(edge);
    }
    tempInteractionEdges = temp2InteractionEdges;

    // merge interaction edges between same same origin and destinations
    var interactionEdges_Merged = [];
    for (var i = 0; i < tempInteractionEdges.length; i++) {
      var e1 = tempInteractionEdges[i];
      var duplicateFound = false;
      for (var j = 0; j < interactionEdges_Merged.length; j++) {
        var e2 = interactionEdges_Merged[j];
        if (setsAreEqual(e1.nodes, e2.nodes) && e1.timestep == e2.timestep) {
          duplicateFound = true;
          interactionEdges_Merged[j]["authors"].push(e1["authors"]);
          interactionEdges_Merged[j]["title"].push(e1["title"]);
          interactionEdges_Merged[j]["link"].push(e1["link"]);
          interactionEdges_Merged[j]["nodesElementDictionaryArray"].push(
            e1["nodesElementDictionaryArray"]
          );
          interactionEdges_Merged[j]["count"] = e2["count"] + 1;
        }
      }
      if (!duplicateFound) {
        interactionEdges_Merged.push({
          nodes: e1.nodes,
          timestep: e1.timestep,
          authors: new Array(e1["authors"]),
          title: new Array(e1["title"]),
          link: new Array(e1["link"]),
          count: 1,
          nodesElementDictionaryArray: new Array(
            e1.nodesElementDictionaryArray
          ),
        });
      }
    }

    // count excluding self-loop
    var nonSelfLoopEdgeCount = 0;
    var selfLoopEdgeCount = 0;
    for (var e of interactionEdges_Merged) {
      if (e.nodes.size > 1) nonSelfLoopEdgeCount++;
      else if (e.nodes.size == 1) selfLoopEdgeCount++;
    }
    console.log(
      "Number of interaction edges excluding self-loop: ",
      nonSelfLoopEdgeCount
    );
    console.log("Number of intra-group interaction edges: ", selfLoopEdgeCount);
    console.log(
      "Total number of interactions: ",
      nonSelfLoopEdgeCount + selfLoopEdgeCount
    );

    return interactionEdges_Merged;
  }

  function setsAreEqual(a, b) {
    if (a.size !== b.size) {
      return false;
    }

    return Array.from(a).every((element) => {
      return b.has(element);
    });
  }

  function findNextPresenceOfObject(object, timestepIndex) {
    for (var i = timestepIndex + 1; i < inputRawData.length; i++) {
      var nodesArray = Object.keys(inputRawData[i]);

      for (var j = 0; j < nodesArray.length; j++) {
        if (nodesArray[j] != "added" && nodesArray[j] != "removed") {
          var objectsinnode = copy(inputRawData[i][nodesArray[j]].exclusive);
          var objectsInnodeIdArray = [];
          for (var x = 0; x < objectsinnode.length; x++)
            objectsInnodeIdArray.push(objectsinnode[x].objectid);
          if (objectsInnodeIdArray.indexOf(object.objectid) > -1) {
            // var deg = inputRawData[i][nodesArray[j]].degree;
            // if(window.degreesAggregated[deg] ==0)
            return { nodeId: "T" + i + "N" + nodesArray[j], timestep: i };
            // else
            //     return "T"+i+"D"+deg;
          }
        }
      }
    }
    return 0;
  }
  function findNextPresenceOfObjectQuery(object, timestepIndex) {
    for (var i = timestepIndex + 1; i < inputRawData.length; i++) {
      var nodesArray = Object.keys(inputRawData[i]);

      for (var j = 0; j < nodesArray.length; j++) {
        if (nodesArray[j] != "added" && nodesArray[j] != "removed") {
          var objectsinnode = copy(inputRawData[i][nodesArray[j]].exclusive);
          var objectsInnodeIdArray = [];
          for (var x = 0; x < objectsinnode.length; x++)
            objectsInnodeIdArray.push(objectsinnode[x].objectid);
          if (objectsInnodeIdArray.indexOf(object.objectid) > -1) {
            var deg = inputRawData[i][nodesArray[j]].degree;
            if (window.degreesAggregated[deg] == 0)
              return "T" + i + "N" + nodesArray[j];
            else return "T" + i + "D" + deg;
          }
        }
      }
    }
    return 0;
  }

  function findPreviousPresenceOfObject(object, timestepIndex) {
    for (var i = timestepIndex - 1; i >= 0; i--) {
      var nodesArray = Object.keys(inputRawData[i]);

      for (var j = 0; j < nodesArray.length; j++) {
        if (nodesArray[j] != "added" && nodesArray[j] != "removed") {
          var objectsinnode = copy(inputRawData[i][nodesArray[j]].exclusive);
          var objectsInnodeIdArray = [];
          for (var x = 0; x < objectsinnode.length; x++)
            objectsInnodeIdArray.push(objectsinnode[x].objectid);
          if (objectsInnodeIdArray.indexOf(object.objectid) > -1) {
            // var deg = inputRawData[i][nodesArray[j]].degree;
            // if(window.degreesAggregated[deg] ==0)
            return "T" + i + "N" + nodesArray[j];
            // else
            //     return "T"+i+"D"+deg;
          }
        }
      }
    }
    return 0;
  }

  function findPreviousPresenceOfObjectQuery(object, timestepIndex) {
    for (var i = timestepIndex - 1; i >= 0; i--) {
      var nodesArray = Object.keys(inputRawData[i]);

      for (var j = 0; j < nodesArray.length; j++) {
        if (nodesArray[j] != "added" && nodesArray[j] != "removed") {
          var objectsinnode = copy(inputRawData[i][nodesArray[j]].exclusive);
          var objectsInnodeIdArray = [];
          for (var x = 0; x < objectsinnode.length; x++)
            objectsInnodeIdArray.push(objectsinnode[x].objectid);
          if (objectsInnodeIdArray.indexOf(object.objectid) > -1) {
            var deg = inputRawData[i][nodesArray[j]].degree;
            if (window.degreesAggregated[deg] == 0)
              return "T" + i + "N" + nodesArray[j];
            else return "T" + i + "D" + deg;
          }
        }
      }
    }
    return 0;
  }

  function copy(o) {
    var output, v, key;
    output = Array.isArray(o) ? [] : {};
    for (key in o) {
      v = o[key];
      output[key] = typeof v === "object" ? copy(v) : v;
    }
    return output;
  }

  function getContainedBaseSetsFromSetId(setId) {
    const setNames = [];
    vis.getBaseSetNames().forEach((setName, i) => {
      if (Math.pow(2, i) & window.hashToBinaryDictionary[setId]) {
        setNames.push(setName);
      }
    });
    return setNames;
  }

  function computeAggregatedGraphStructure() {
    window.aggregatedNodes = {};
    window.aggregatedEdges = [];

    for (var nodeid in window.nodes) {
      var tempDegreeOfNode = window.nodes[nodeid]["degree"];
      if (
        window.degreesAggregated[tempDegreeOfNode] == 0 ||
        tempDegreeOfNode == undefined
      ) {
        window.aggregatedNodes[nodeid] = Object.assign(
          {},
          window.nodes[nodeid]
        );
      } else {
        var tempTimestep = window.nodes[nodeid]["timestep"];
        var tempNewNodeId = "T" + tempTimestep + "D" + tempDegreeOfNode;
        var tempweight = window.nodes[nodeid]["weight"];

        // for(var i=0; i<degreeDictionary[tempDegreeOfNode].length; i++)
        // {
        //     var tempConceptId = degreeDictionary[tempDegreeOfNode][i];
        //     for(var j=0; j<window.inputRawData.length; j++)
        //     {
        //         if(tempConceptId in window.inputRawData[j])
        //         {
        //             tempweight += window.inputRawData[j][tempConceptId].exclusive.length;
        //             break;
        //         }
        //     }
        // }

        if (!(tempNewNodeId in window.aggregatedNodes))
          window.aggregatedNodes[tempNewNodeId] = {
            nodeId: tempNewNodeId,
            degree: tempDegreeOfNode,
            timestep: tempTimestep,
            type: "aggregated",
            weight: tempweight,
          };
        else {
          window.aggregatedNodes[tempNewNodeId]["weight"] += tempweight;
        }
      }
    }

    for (var i = 0; i < edges.length; i++) {
      var sourceNode = window.nodes[edges[i]["from"]];
      var targetNode = window.nodes[edges[i]["to"]];
      var tempEdge = Object.assign({}, edges[i]);

      if (checkIfNodeHasToBeAggregated(sourceNode["nodeId"])) {
        var aggnodeId = returnCorrespondingAggregatedNodeId(
          sourceNode["nodeId"]
        );
        tempEdge["from"] = aggnodeId;
      }
      if (checkIfNodeHasToBeAggregated(targetNode["nodeId"])) {
        var aggnodeId = returnCorrespondingAggregatedNodeId(
          targetNode["nodeId"]
        );
        tempEdge["to"] = aggnodeId;
      }
      window.aggregatedEdges.push(tempEdge);
    }

    // Merge edges with same origin and destination

    for (var i = 0; i < aggregatedEdges.length; i++) {
      for (var j = 0; j < aggregatedEdges.length; ) {
        if (
          i != j &&
          aggregatedEdges[i].from === aggregatedEdges[j].from &&
          aggregatedEdges[i].to === aggregatedEdges[j].to
        ) {
          aggregatedEdges[i].objects = aggregatedEdges[i].objects.concat(
            aggregatedEdges[j].objects
          );
          aggregatedEdges.splice(j, 1);
        } else j++;
      }
    }
    window.edgeIdCounter = 0;
    for (var i = 0; i < aggregatedEdges.length; i++) {
      aggregatedEdges[i]["id"] = "e" + edgeIdCounter;
      edgeIdCounter++;
    }
  }

  function returnCorrespondingAggregatedNodeId(nodeId) {
    return (
      "T" +
      window.nodes[nodeId]["timestep"] +
      "D" +
      window.nodes[nodeId]["degree"]
    );
  }

  function checkIfNodeHasToBeAggregated(nodeId) {
    var tempDegreeOfNode = window.nodes[nodeId]["degree"];
    if (window.degreesAggregated[tempDegreeOfNode] == 1) return true;
    else return false;
  }

  function checkIfRowIsAggregated() {
    if (degreesAggregated.indexOf(1) > 0) return true;
    else return false;
  }

  function computeInteractionSimilarity(row1Hash, row2Hash) {
    var similarityScore = 0;
    row1Hash = row1Hash + "";
    row2Hash = row2Hash + "";
    for (var edge of window.interactionEdges) {
      if (edge.nodes.has(row1Hash) && edge.nodes.has(row2Hash)) {
        similarityScore += edge.authors.length;
      }
    }
    return similarityScore;
  }

  function computeSimilarity(row1, row2) {
    var row1Id = "";
    var row2Id = "";
    var similarityScore = 0;

    if (typeof row1 == "string" && row1.includes("Degree"))
      row1Id = "D" + row1.charAt(6);
    else row1Id = "N" + row1;

    if (typeof row2 == "string" && row2.includes("Degree"))
      row2Id = "D" + row2.charAt(6);
    else row2Id = "N" + row2;

    for (var j = 1; j < inputRawData.length; j++) {
      var tempRow1NodeidPresent = "T" + j + row1Id;
      var tempRow1NodeidPast = "T" + (j - 1) + row1Id;
      var tempRow2NodeidPresent = "T" + j + row2Id;
      var tempRow2NodeidPast = "T" + (j - 1) + row2Id;

      for (var k = 0; k < window.edges.length; k++) {
        // if( (window.edges[k].to == tempRow1Nodeid && window.edges[k].from == tempRow2Nodeid) ||
        //     (window.edges[k].from == tempRow1Nodeid && window.edges[k].to == tempRow2Nodeid) )
        if (
          (window.edges[k].from.includes(row1Id) &&
            window.edges[k].to.includes(row2Id)) ||
          (window.edges[k].to.includes(row1Id) &&
            window.edges[k].from.includes(row2Id))
        ) {
          similarityScore += window.edges[k].objects.length;
          // similarityScore += 1;
        }
      }
    }
    // console.log(similarityScore);
    return similarityScore;
  }

  function computeGraphLayout() {
    var numSets = degreeDictionary["1"].length;
    window.originalNodes = copy(window.nodes);
    window.originalEdges = copy(window.edges);
    if (checkIfRowIsAggregated()) {
      window.nodes = window.aggregatedNodes;
      window.edges = window.aggregatedEdges;
    }

    var width = document.getElementById("mainVisualization").offsetWidth;
    var height =
      d3.select("#mainVisualization").node().getBoundingClientRect().height -
      24;
    var topPadding = 45;
    var leftPadding = 10;

    var heightOfDegreeDistributionBox = 30;
    var distanceFromAddedRemovedNodes = 30;
    window.maxHeightOfNode = 15 + 50 / numSets;
    window.widthOfNode = 140;

    var rightPadding = window.widthOfNode + 10;
    // var paddingBetweenNodes = 6 + 30/numSets;;
    var paddingBetweenNodes = 20;
    var maxDegree = d3.max(Object.keys(degreeDictionary));

    var paddingBetweenDegreeDistributionAndNodes = 5;

    if (window.currentDatasetId == "tech") {
      topPadding = 50;
      window.widthOfNode = 70;
      window.maxHeightOfNode = 10;
      paddingBetweenNodes = 20;
      guiParams.additionalHeight = 15;
    }

    var tempDistanceFromTop =
      topPadding +
      heightOfDegreeDistributionBox +
      paddingBetweenDegreeDistributionAndNodes;

    d3.selectAll("#numSets").text(degreeDictionary["1"].length);
    // compute vertical positions of nodes
    var verticalPosition = {};
    var positionCounter = 1;
    window.hashToBinaryDictionary = {};

    var posToNameForBaseSetsDictionary = {};
    var leftSpaceForDegreeGroup = 20;
    var marginBeforeAndAfterText = 5;

    var allConceptHashs = [];
    for (var degree in degreeDictionary) {
      if (window.degreesAggregated[degree] == 1)
        allConceptHashs.push("Degree" + degree);
      else {
        for (var index in degreeDictionary[degree]) {
          var conceptHash = degreeDictionary[degree][index];
          if (allConceptHashs.indexOf(conceptHash) == -1)
            allConceptHashs.push(conceptHash);
        }
      }
    }

    if (window.sortBy == "degree") {
      // K-set grouping sort
      for (var i = 1; i <= maxDegree; i++) {
        if (degreesAggregated[i] == 1) {
          verticalPosition["Degree" + i] = positionCounter;
          positionCounter++;
        } else {
          var concepts = degreeDictionary[i];
          for (var j = 0; j < concepts.length; j++) {
            verticalPosition[concepts[j]] = positionCounter;
            positionCounter++;
          }
        }
      }
    } else if (window.sortBy == "timestep") {
      var items = [];
      for (var deg in degreeDictionary) {
        if (degreesAggregated[deg] == 0) {
          for (var m = 0; m < degreeDictionary[deg].length; m++) {
            var conceptid = degreeDictionary[deg][m];
            if (
              conceptid in
              window.inputRawData[window.selectedTimestepForSorting]
            )
              items.push([
                conceptid,
                window.inputRawData[window.selectedTimestepForSorting][
                  conceptid
                ].exclusive.length,
              ]);
          }
        } else {
          var tempcount = 0;
          for (var m = 0; m < degreeDictionary[deg].length; m++) {
            var conceptid = degreeDictionary[deg][m];
            if (
              conceptid in
              window.inputRawData[window.selectedTimestepForSorting]
            )
              tempcount +=
                window.inputRawData[window.selectedTimestepForSorting][
                  conceptid
                ].exclusive.length;
          }
          items.push(["Degree" + deg, tempcount]);
        }
      }

      items.sort(function (a, b) {
        if (
          a[0] == "added" ||
          a[0] == "removed" ||
          b[0] == "added" ||
          b[0] == "removed"
        )
          return 1;
        else return b[1] - a[1];
      });

      verticalPosition = {};
      positionCounter = 1;
      for (var i = 0; i < items.length; i++) {
        if (items[i][0] != "added" && items[i][0] != "removed") {
          verticalPosition[items[i][0]] = positionCounter;
          positionCounter++;
        }
      }

      for (var i = 0; i < allConceptHashs.length; i++) {
        if (!(allConceptHashs[i] in verticalPosition)) {
          verticalPosition[allConceptHashs[i]] = positionCounter;
          positionCounter++;
        }
      }
    } else if (window.sortBy == "stability_old") {
      var conceptsInstabilityTuple = [];
      for (var deg in degreeDictionary) {
        var degreeWeight = 0;
        for (var i = 0; i < degreeDictionary[deg].length; i++) {
          var instabilityWeight = 0;
          var conceptId = degreeDictionary[deg][i];
          for (var j = 0; j < inputRawData.length; j++) {
            var nodeId = "T" + j;
            if (window.degreesAggregated[deg] == 0) nodeId += "N" + conceptId;
            else nodeId += "D" + deg;

            for (var k = 0; k < window.edges.length; k++) {
              if (
                window.edges[k].to == nodeId &&
                window.edges[k].from != nodeId
              ) {
                instabilityWeight += window.edges[k].objects.length;
              }
            }
          }
          if (window.degreesAggregated[deg] == 0)
            conceptsInstabilityTuple.push([conceptId, instabilityWeight]);
          else {
            degreeWeight += instabilityWeight;
          }
        }
        if (window.degreesAggregated[deg] == 1)
          conceptsInstabilityTuple.push(["Degree" + deg, degreeWeight]);
      }
      conceptsInstabilityTuple.sort(function (a, b) {
        return b[1] - a[1];
      });

      verticalPosition = {};
      positionCounter = 1;
      for (var i = 0; i < conceptsInstabilityTuple.length; i++) {
        verticalPosition[conceptsInstabilityTuple[i][0]] = positionCounter;
        positionCounter++;
      }
    } else if (window.sortBy == "stability") {
      var conceptsInstabilityTuple = [];
      for (var deg in degreeDictionary) {
        var degreeWeight = 0;
        var degreeSummedCardinality = 0;
        var degreePresenceInTimesteps = 0;
        var numTimesteps = window.inputRawData.length;
        for (var i = 0; i < degreeDictionary[deg].length; i++) {
          var stabilityWeight = 0;
          var summedCardinality = 0;
          var presenceInTimesteps = 0;
          var conceptId = degreeDictionary[deg][i];
          var nodeId = "";
          if (window.degreesAggregated[deg] == 0) nodeId += "N" + conceptId;
          else nodeId += "D" + deg;

          for (var k = 0; k < window.edges.length; k++) {
            if (
              window.edges[k].to.includes(nodeId) &&
              window.edges[k].from.includes(nodeId)
            ) {
              stabilityWeight +=
                window.edges[k].objects.length /
                window.nodes[window.edges[k].from].weight;
            }
          }
          for (var nId in window.nodes) {
            if (nId.includes(nodeId)) {
              summedCardinality += window.nodes[nId].weight;
              presenceInTimesteps += 1;
            }
          }

          if (window.degreesAggregated[deg] == 0)
            // conceptsInstabilityTuple.push([conceptId, (stabilityWeight/summedCardinality + presenceInTimesteps/numTimesteps)]);
            conceptsInstabilityTuple.push([conceptId, stabilityWeight]);
          else {
            degreeWeight += stabilityWeight;
            degreeSummedCardinality += summedCardinality;
            degreePresenceInTimesteps += presenceInTimesteps / numTimesteps;
          }
        }
        if (window.degreesAggregated[deg] == 1)
          // conceptsInstabilityTuple.push([("Degree"+deg), (degreeWeight/degreeSummedCardinality + degreePresenceInTimesteps)]);
          conceptsInstabilityTuple.push(["Degree" + deg, degreeWeight]);
      }
      conceptsInstabilityTuple.sort(function (a, b) {
        return b[1] - a[1];
      });

      verticalPosition = {};
      positionCounter = 1;
      for (var i = 0; i < conceptsInstabilityTuple.length; i++) {
        verticalPosition[conceptsInstabilityTuple[i][0]] = positionCounter;
        positionCounter++;
      }
    } else if (window.sortBy == "cumulative") {
      var conceptsInstabilityTuple = [];
      for (var deg in degreeDictionary) {
        var degreeWeight = 0;
        var degreeSummedCardinality = 0;
        var degreePresenceInTimesteps = 0;
        var numTimesteps = window.inputRawData.length;
        for (var i = 0; i < degreeDictionary[deg].length; i++) {
          var stabilityWeight = 0;
          var summedCardinality = 0;
          var presenceInTimesteps = 0;
          var conceptId = degreeDictionary[deg][i];
          var nodeId = "";
          if (window.degreesAggregated[deg] == 0) nodeId += "N" + conceptId;
          else nodeId += "D" + deg;

          for (var k = 0; k < window.edges.length; k++) {
            if (
              window.edges[k].to.includes(nodeId) &&
              window.edges[k].from.includes(nodeId)
            ) {
              stabilityWeight += window.edges[k].objects.length;
            }
          }
          for (var nId in window.nodes) {
            if (nId.includes(nodeId)) {
              summedCardinality += window.nodes[nId].weight;
              presenceInTimesteps += 1;
            }
          }

          if (window.degreesAggregated[deg] == 0)
            conceptsInstabilityTuple.push([conceptId, summedCardinality]);
          else {
            degreeWeight += stabilityWeight;
            degreeSummedCardinality += summedCardinality;
            degreePresenceInTimesteps += presenceInTimesteps / numTimesteps;
          }
        }
        if (window.degreesAggregated[deg] == 1)
          conceptsInstabilityTuple.push([
            "Degree" + deg,
            degreeSummedCardinality,
          ]);
      }
      conceptsInstabilityTuple.sort(function (a, b) {
        return b[1] - a[1];
      });

      verticalPosition = {};
      positionCounter = 1;
      for (var i = 0; i < conceptsInstabilityTuple.length; i++) {
        verticalPosition[conceptsInstabilityTuple[i][0]] = positionCounter;
        positionCounter++;
      }
    } else if (window.sortBy == "custom") {
      var rows = [];
      for (var deg in degreeDictionary) {
        for (var i = 0; i < degreeDictionary[deg].length; i++) {
          var conceptId = degreeDictionary[deg][i];

          if (window.degreesAggregated[deg] == 0) rows.push(conceptId);
        }
        if (window.degreesAggregated[deg] == 1) rows.push("Degree" + deg);
      }

      rows.sort(function (a, b) {
        return computeSimilarity(a, b);
      });

      verticalPosition = {};
      positionCounter = 1;
      for (var i = 0; i < rows.length; i++) {
        verticalPosition[rows[i]] = positionCounter;
        positionCounter++;
      }
    } else if (window.sortBy == "similarity") {
      var conceptsInstabilityTuple = [];
      for (var deg in degreeDictionary) {
        var degreeWeight = 0;
        for (var i = 0; i < degreeDictionary[deg].length; i++) {
          var instabilityWeight = 0;
          var conceptId = degreeDictionary[deg][i];
          for (var j = 0; j < inputRawData.length; j++) {
            var nodeId = "T" + j;
            if (window.degreesAggregated[deg] == 0) nodeId += "N" + conceptId;
            else nodeId += "D" + deg;

            for (var k = 0; k < window.edges.length; k++) {
              if (
                window.edges[k].to == nodeId &&
                window.edges[k].from.includes("added")
              ) {
                instabilityWeight += window.edges[k].objects.length;
              }
            }
          }
          if (window.degreesAggregated[deg] == 0)
            conceptsInstabilityTuple.push([conceptId, instabilityWeight]);
          else {
            degreeWeight += instabilityWeight;
          }
        }
        if (window.degreesAggregated[deg] == 1)
          conceptsInstabilityTuple.push(["Degree" + deg, degreeWeight]);
      }
      conceptsInstabilityTuple.sort(function (a, b) {
        return b[1] - a[1];
      });

      var rows = [];
      for (var deg in degreeDictionary) {
        for (var i = 0; i < degreeDictionary[deg].length; i++) {
          var conceptId = degreeDictionary[deg][i];

          if (window.degreesAggregated[deg] == 0) rows.push(conceptId);
        }
        if (window.degreesAggregated[deg] == 1) rows.push("Degree" + deg);
      }

      var sortedRows = [conceptsInstabilityTuple[0][0]];
      // rows.splice( rows.indexOf(conceptsInstabilityTuple[0][0]) , 1);
      var lastAddedRow = conceptsInstabilityTuple[0][0];

      var remainingRows = Array.from(rows);
      remainingRows.splice(remainingRows.indexOf(lastAddedRow), 1);

      while (remainingRows.length > 0) {
        var similarityScoreArray = [];
        for (var j = 0; j < sortedRows.length; j++) {
          for (var k = 0; k < remainingRows.length; k++)
            similarityScoreArray.push([
              sortedRows[j],
              remainingRows[k],
              computeSimilarity(sortedRows[j], remainingRows[k]),
            ]);
        }
        similarityScoreArray.sort(function (a, b) {
          return b[2] - a[2];
        });
        // for(var j=0; j<similarityScoreArray.length; j++)
        {
          // if(sortedRows.indexOf(similarityScoreArray[j][1]) ==-1)
          if (sortedRows.indexOf(similarityScoreArray[0][1]) == -1) {
            lastAddedRow = similarityScoreArray[0][1];
            sortedRows.push(lastAddedRow);
            remainingRows.splice(remainingRows.indexOf(lastAddedRow), 1);
            // break;
          }
        }
      }

      verticalPosition = {};
      positionCounter = 1;
      for (var i = 0; i < sortedRows.length; i++) {
        verticalPosition[sortedRows[i]] = positionCounter;
        positionCounter++;
      }
    } else if (window.sortBy == "numInteractions") {
      var conceptsInstabilityTuple = [];
      var conceptTupleDictionary = {};

      for (var deg in degreeDictionary) {
        for (var concept of degreeDictionary[deg]) {
          conceptTupleDictionary[concept] = 0;
        }
      }

      for (var edge of window.interactionEdges) {
        edge.nodes.forEach((conceptHash) => {
          var intConceptHash = parseInt(conceptHash);
          if (intConceptHash in conceptTupleDictionary)
            conceptTupleDictionary[intConceptHash] += edge.authors.length;
        });
      }
      for (var conceptHash in conceptTupleDictionary) {
        conceptsInstabilityTuple.push([
          parseInt(conceptHash),
          conceptTupleDictionary[conceptHash],
        ]);
      }

      conceptsInstabilityTuple.sort(function (a, b) {
        return b[1] - a[1];
      });

      var rows = [];
      for (var deg in degreeDictionary) {
        for (var i = 0; i < degreeDictionary[deg].length; i++) {
          var conceptId = degreeDictionary[deg][i];

          if (window.degreesAggregated[deg] == 0) rows.push(conceptId);
        }
      }

      var sortedRows = [conceptsInstabilityTuple[0][0]];
      var lastAddedRow = conceptsInstabilityTuple[0][0];

      var remainingRows = Array.from(rows);
      remainingRows.splice(remainingRows.indexOf(lastAddedRow), 1);

      while (remainingRows.length > 0) {
        var similarityScoreArray = [];
        for (var j = 0; j < sortedRows.length; j++) {
          for (var k = 0; k < remainingRows.length; k++)
            similarityScoreArray.push([
              sortedRows[j],
              remainingRows[k],
              computeInteractionSimilarity(sortedRows[j], remainingRows[k]),
            ]);
        }
        similarityScoreArray.sort(function (a, b) {
          return b[2] - a[2];
        });
        // for(var j=0; j<similarityScoreArray.length; j++)
        {
          // if(sortedRows.indexOf(similarityScoreArray[j][1]) ==-1)
          if (sortedRows.indexOf(similarityScoreArray[0][1]) == -1) {
            lastAddedRow = similarityScoreArray[0][1];
            sortedRows.push(lastAddedRow);
            remainingRows.splice(remainingRows.indexOf(lastAddedRow), 1);
            // break;
          }
        }
      }

      verticalPosition = {};
      positionCounter = 1;
      for (var i = 0; i < sortedRows.length; i++) {
        verticalPosition[sortedRows[i]] = positionCounter;
        positionCounter++;
      }
    } else if (window.sortBy == "set_priority") {
      var rows = [];
      var index = 1;
      for (var deg in degreeDictionary) {
        var degree = parseInt(deg);
        if (
          window.degreesAggregated[degree] == 1 &&
          degreeDictionary[degree].indexOf(window.selectedSetIdForPriority) >= 0
        )
          rows.push(["Degree" + deg, degree]);
        else {
          if (window.degreesAggregated[deg] == 1) {
            rows.push(["Degree" + deg, window.numSets + index]);
            index++;
          } else {
            for (var i = 0; i < degreeDictionary[deg].length; i++) {
              var conceptId = degreeDictionary[deg][i];

              // if(conceptId == window.selectedSetIdForPriority)
              if (
                window.sethashandNameDict[conceptId].includes(
                  window.sethashandNameDict[window.selectedSetIdForPriority]
                )
              )
                rows.push([conceptId, degree]);
              else {
                rows.push([conceptId, window.numSets + index]);
                index++;
              }
            }
          }
        }
      }

      rows.sort(function (a, b) {
        return a[1] - b[1];
      });

      verticalPosition = {};
      positionCounter = 1;
      for (var i = 0; i < rows.length; i++) {
        verticalPosition[rows[i][0]] = positionCounter;
        positionCounter++;
      }
    }

    guiParams.verticalPosition = verticalPosition;

    var baseSetOrder = {};
    var baseSetPosition = 1;
    for (var i = 0; i < degreeDictionary["1"].length; i++) {
      baseSetOrder[degreeDictionary["1"][i]] = baseSetPosition;
      baseSetPosition++;
    }

    for (var i = 0; i < degreeDictionary["1"].length; i++) {
      var tempConceptHash = degreeDictionary["1"][i];
      // var pos = verticalPosition[tempConceptHash];
      var pos = baseSetOrder[tempConceptHash];
      window.hashToBinaryDictionary[tempConceptHash] = Math.pow(2, pos - 1);
      posToNameForBaseSetsDictionary[pos] = sethashandNameDict[tempConceptHash];
    }
    window.setNameToHashDictionary = {};
    for (var hash in sethashandNameDict) {
      setNameToHashDictionary[sethashandNameDict[hash]] = hash;
    }

    for (var concept in verticalPosition) {
      if (!(concept in window.hashToBinaryDictionary)) {
        var tempName = sethashandNameDict[concept];
        if (tempName != undefined) {
          if (tempName.substr(tempName.length - 1) === ",")
            tempName = tempName.slice(0, -1);

          var involvedSetNamesArray = tempName.split(",");
          var tempBinary = 0;
          for (var k = 0; k < involvedSetNamesArray.length; k++) {
            // var tnum = verticalPosition[setNameToHashDictionary[involvedSetNamesArray[k]]];
            var tnum =
              baseSetOrder[setNameToHashDictionary[involvedSetNamesArray[k]]];
            tempBinary = tempBinary | Math.pow(2, tnum - 1);
          }
          window.hashToBinaryDictionary[concept] = tempBinary;
        }
      }
    }

    var maxConceptsInTimestep = Object.keys(verticalPosition).length;

    var numTimesteps = window.inputRawData.length;
    var widthOfOneZone = (width - numSets * 30) / numTimesteps;
    if (widthOfOneZone < guiParams.widthOfOneZone_Min)
      widthOfOneZone = guiParams.widthOfOneZone_Min;

    guiParams.widthOfOneZone = widthOfOneZone;

    var heightOfEachRow = [];
    var sortedVerticalPositions = [];
    window.verticalPositionRowHeight = {};
    for (var hash in verticalPosition) {
      sortedVerticalPositions.push([hash, verticalPosition[hash]]);
    }

    sortedVerticalPositions = sortedVerticalPositions.sort(function (a, b) {
      return a[1] - b[1];
    });

    if (window.edgeThicknessScale != undefined) {
      var cumulative = 0;
      for (var z = 0; z < sortedVerticalPositions.length; z++) {
        if (sortedVerticalPositions[z][0].includes("Degree")) {
          var tempMax = 0;
          var rowDegree = parseInt(sortedVerticalPositions[z][0].charAt(6));
          for (var nId in window.nodes) {
            if (nId.includes("D" + rowDegree)) {
              if (tempMax < window.nodes[nId].weight)
                tempMax = window.nodes[nId].weight;
            }
          }
          var ht = 0;
          if (tempMax > window.maxUnaggregatedWeight)
            ht = edgeThicknessScale(tempMax);
          else ht = maxHeightOfNode;

          cumulative += ht;
          heightOfEachRow.push([
            sortedVerticalPositions[z][0],
            sortedVerticalPositions[z][1],
            ht,
            cumulative,
          ]);
        } else {
          var ht = maxHeightOfNode;
          cumulative += ht;

          heightOfEachRow.push([
            sortedVerticalPositions[z][0],
            sortedVerticalPositions[z][1],
            ht,
            cumulative,
          ]);
        }
        window.verticalPositionRowHeight[heightOfEachRow[z][1]] = [
          heightOfEachRow[z][2],
          heightOfEachRow[z][3],
        ];
      }
    } else {
      var cumulative = 0;
      for (var z = 0; z < sortedVerticalPositions.length; z++) {
        cumulative += maxHeightOfNode;
        window.verticalPositionRowHeight[sortedVerticalPositions[z][1]] = [
          maxHeightOfNode,
          cumulative,
        ];
      }
    }

    for (var node in window.nodes) {
      var timestep = parseInt(node.substr(1, 1));

      var temphash = node.substr(3, node.length);
      if (temphash === "added") {
        window.nodes[node].x =
          widthOfOneZone * (timestep + 1) - widthOfOneZone * 0.95;
        window.nodes[node].y = 0 + tempDistanceFromTop;
      } else if (temphash === "removed") {
        window.nodes[node].x =
          widthOfOneZone * (timestep + 1) + widthOfOneZone * 0.4;
        window.nodes[node].y =
          (maxConceptsInTimestep + 1) *
            (maxHeightOfNode + paddingBetweenNodes) +
          tempDistanceFromTop +
          2 * distanceFromAddedRemovedNodes;
      } else {
        window.nodes[node].x =
          widthOfOneZone * (timestep + 1) - widthOfOneZone / 2;
        if (node.charAt(2) == "D") temphash = "Degree" + temphash;
        else temphash = parseInt(temphash);

        // var cumulativePreviousRowHeights = 0;
        // var rowPosition = verticalPosition[temphash];
        // for(var z=0; z<heightOfEachRow.length; z++)
        // {
        //     if(heightOfEachRow[z][1] <= rowPosition)
        //         cumulativePreviousRowHeights += heightOfEachRow[z][2];
        // }
        if (!(temphash in verticalPosition))
          console.log(
            "Hash not found in verticalPosition",
            temphash,
            verticalPosition
          );
        window.nodes[node].y =
          window.verticalPositionRowHeight[verticalPosition[temphash]][1] +
          verticalPosition[temphash] * paddingBetweenNodes +
          tempDistanceFromTop +
          distanceFromAddedRemovedNodes;
      }

      window.nodes[node].xBoundary = window.nodes[node].x;
      window.nodes[node].yBoundary = window.nodes[node].y;
      window.nodes[node].contentx = window.nodes[node].x;
    }

    function drawLeftColumn(svg, graphScrollGroup) {
      guiParams.ksetGroupWidth = 0;

      // Draw left column to show participating sets in intersection
      var rowLegend = svg.append("g");

      // d3.select("#sortButton").on("click",function(){ alert("clicked")});

      var ksetRowGroup = svg.append("g");
      var bbox = 0;
      var invisibleText = ksetRowGroup
        .append("text")
        .text("Exclusive " + numSets + "-set intersections")
        .attr({
          opacity: 0,
          "text-anchor": "start",
          class: "ksetIntersectionLabel",
        });
      bbox = invisibleText.node().getBBox();
      var tempWidth =
        numSets * (blockSize + paddingBetweenBlocks) +
        leftSpaceForDegreeGroup +
        blockSize / 2 +
        2 * marginBeforeAndAfterText;
      bbox.width += 2 * marginBeforeAndAfterText;
      if (bbox.width > tempWidth) guiParams.ksetGroupWidth = bbox.width + 15;
      else guiParams.ksetGroupWidth = tempWidth;

      // guiParams.ksetGroupWidth += marginBeforeAndAfterText+ 2*guiParams.fontSize;

      // A big white rectangle on the left to hide main graph vis when it is scrolled on the left
      rowLegend.append("rect").attr({
        x: 0,
        y: 0,
        width: guiParams.ksetGroupWidth,
        height: height * 4,
        fill: "white",
      });

      // console.log(numSets, blockSize, paddingBetweenBlocks, leftSpaceForDegreeGroup, marginBeforeAndAfterText);
      for (var deg in degreeDictionary) {
        deg = parseInt(deg);
        var verticalPositionOfksetRow = 0;
        for (var previousDegree = 1; previousDegree < deg; previousDegree++) {
          var rowsInTheDegree = degreeDictionary[previousDegree].length;
          if (window.degreesAggregated[previousDegree] == 1)
            verticalPositionOfksetRow += 1;
          else verticalPositionOfksetRow += rowsInTheDegree;
        }
        var tempPos =
          maxHeightOfNode +
          window.verticalPositionRowHeight[verticalPositionOfksetRow + 1][1] -
          window.verticalPositionRowHeight[verticalPositionOfksetRow + 1][0] +
          verticalPositionOfksetRow * paddingBetweenNodes +
          tempDistanceFromTop +
          distanceFromAddedRemovedNodes;

        window.shiftMainVisByX =
          guiParams.ksetGroupWidth - widthOfOneZone / 2 + 20;

        ksetRowGroup.append("rect").attr({
          x: 0,
          y: tempPos + 1,
          // "width": guiParams.ksetGroupWidth + 2*guiParams.fontSize,
          width: guiParams.ksetGroupWidth,
          // "height": paddingBetweenNodes,
          height: guiParams.fontSize + 1,
          fill: "lightgrey",
          class: "ksetIntersectionLabel",
        });
        var numRowsInksets = degreeDictionary[deg].length;

        var txtel = ksetRowGroup
          .append("text")
          .text("Exclusive " + deg + "-set intersections")
          .attr({
            x: marginBeforeAndAfterText,
            y: tempPos + paddingBetweenNodes / 2,
            "dominant-baseline": "middle",
            "text-anchor": "start",
            "font-size": guiParams.fontSize,
            class: "ksetIntersectionLabel",
          });

        // Commenting out the functionality of aggregating by degree
        // ksetRowGroup.append("text").text(function(){
        //     if(window.degreesAggregated[deg] == 0)
        //         return '-';
        //     else
        //         return '+';
        // }).attr({
        //     // "x": guiParams.ksetGroupWidth + 10,
        //     "x": marginBeforeAndAfterText + guiParams.ksetGroupWidth + guiParams.fontSize,
        //     "y": tempPos + paddingBetweenNodes/2,
        //     "dominant-baseline":"middle",
        //     "text-anchor":"end",
        //     "cursor":"pointer",
        //     "class":"ksetIntersectionLabel aggregationIcon",
        //     "font-weight":"bold",
        //     "font-size": "18px",
        //     "degree": deg,
        //     "collapsed": function(){
        //         if(window.degreesAggregated[deg] == 0)
        //         return "false";
        //     else
        //         return 'true';
        //     }
        // }).on("click", function(){
        //     var curElement = d3.select(this);
        //     var deg = +curElement.attr("degree");
        //     if(curElement.attr("collapsed") == "true")
        //     {
        //         window.degreesAggregated[deg] = 0;
        //         curElement.text("-");
        //         curElement.attr("collapsed", "false");
        //     }
        //     else
        //     {
        //         window.degreesAggregated[deg] = 1;
        //         curElement.text("+");
        //         curElement.attr("collapsed", "true");
        //     }
        //     // console.log(degreesAggregated);
        //     deconstructGui();
        //     computeGraphStructure();
        //     computeGraphLayout();
        //     // createElementList();
        //     // populateAdditionalAttributeArea();
        //     updateSelectedGroupEdges();
        //     computeAndDrawGroupEdges(window.selectedElement, "0");

        // }).append("title").text(function(){
        //     if(window.degreesAggregated[deg] == 0)
        //     return "Collapse "+deg+"-set intersection rows";
        //     else
        //         return "Expand "+deg+"-set intersection rows";
        // });
      }
      d3.selectAll(".ksetIntersectionLabel").attr("visibility", function () {
        if (window.sortBy == "degree") return "visible";
        else return "hidden";
      });

      // Labels for base set columns

      var csresearchSetNames = {
        NLP: "NLP",
        "AI/ML": "AI/ML",
        "Graphics/Vis./HCI": "Graphics/Vis./HCI",
        "Computer Architecture": "Computer Architecture",
        "Software Engineering": "Software Eng.",
      };

      for (var i = 0; i < numSets; i++) {
        const setName = posToNameForBaseSetsDictionary[i + 1];
        const y =
          (numSets - i) * -(12 + 10 / numSets) +
          tempDistanceFromTop +
          distanceFromAddedRemovedNodes +
          maxHeightOfNode / 2 -
          blockSize / 2 +
          10;
        const fixedY =
          tempDistanceFromTop +
          distanceFromAddedRemovedNodes +
          maxHeightOfNode -
          5;
        const x = i * (blockSize + paddingBetweenBlocks);

        const setHash = setNameToHashDictionary[setName];
        rowLegend.append("rect").attr({
          x: x - 3,
          y: fixedY + 2,
          width: blockSize + 6,
          // "height": height,
          height:
            maxConceptsInTimestep * (maxHeightOfNode + paddingBetweenNodes) +
            tempDistanceFromTop +
            distanceFromAddedRemovedNodes,
          // "stroke-width": "1",
          // "stroke": "black",
          fill: "white",
          class: "BaseSet" + setHash + " highlightRectCol",
          opacity: guiParams.highlightOpacity,
        });

        rowLegend.append("rect").attr({
          x: x,
          y: fixedY,
          // "width": 120,
          width: 400,
          // "height": height,
          height: blockSize + paddingBetweenBlocks / 2 - 2,
          fill: "white",
          class: "BaseSet" + setHash + " highlightRectCol",
          opacity: guiParams.highlightOpacity,
          transform:
            " rotate(-50," +
            x +
            "," +
            fixedY +
            ")  skewX(40) translate(" +
            (-fixedY + 12) +
            "," +
            (-blockSize / 2 - paddingBetweenBlocks / 2 + 9) +
            ")",
        });

        rowLegend
          .append("text")
          .attr({
            x: x + 12,
            y: fixedY - 5,
            "dominant-baseline": "middle",
            setid: setHash,
            cursor: "pointer",
          })
          .text(function () {
            if (window.currentDatasetId == "csresearch")
              return csresearchSetNames[setName];
            else return setName;
          })
          .attr("transform", "rotate(-50," + (x + 12) + "," + fixedY + ")")
          .on("click", function () {
            var setid = parseInt(d3.select(this).attr("setid"));
            window.sortBy = "set_priority";
            window.selectedSetIdForPriority = setid;
            deconstructGui();
            computeGraphStructure();

            computeGraphLayout();
            d3.selectAll(".ksetIntersectionLabel").attr("visibility", "hidden");
            updateSelectedGroupEdges();
            computeAndDrawGroupEdges(window.selectedElement, "0");
          });
        if (
          window.selectedSetIdForPriority == setHash &&
          window.sortBy == "set_priority"
        )
          rowLegend
            .append("svg:image")
            .attr("x", x - 5)
            .attr("y", fixedY - 10)
            .attr("width", 20)
            .attr("height", 30)
            .attr("class", "sortIcon")
            .attr("xlink:href", "images/downArrow.png");
      }
      window.highlightRectPositions = [];
      for (var concept in verticalPosition) {
        var pos = verticalPosition[concept];
        var start = 9999,
          end = -1;
        for (var i = 0; i < numSets; i++) {
          if (Math.pow(2, i) & window.hashToBinaryDictionary[concept]) {
            if (start > i) start = i;
            if (end < i) end = i;
          }
        }

        // Highlight rectangles for rows
        // var additionalHeight = 15;
        var highlightYPos =
          verticalPositionRowHeight[pos][1] -
          verticalPositionRowHeight[pos][0] +
          maxHeightOfNode +
          pos * paddingBetweenNodes +
          tempDistanceFromTop +
          distanceFromAddedRemovedNodes -
          guiParams.additionalHeight / 2;
        window.highlightRectPositions.push([
          highlightYPos,
          verticalPositionRowHeight[pos][0] + guiParams.additionalHeight,
          "RowId" + concept,
        ]);
        rowLegend
          .append("rect")
          .attr({
            class: "highlightRect " + "SetId" + concept,
            id: "RowId" + concept,
            rowId: concept,
            x: -(leftPadding + leftSpaceForDegreeGroup),
            // "y": (pos) * (maxHeightOfNode + paddingBetweenNodes) + tempDistanceFromTop + distanceFromAddedRemovedNodes + maxHeightOfNode / 2 - blockSize,
            y: highlightYPos,
            width: width,
            height:
              verticalPositionRowHeight[pos][0] + guiParams.additionalHeight,
            fill: "white",
            opacity: guiParams.highlightOpacity,
          })
          .on("mouseenter", function () {
            highlightRects(d3.select(this));
          })
          .on("mouseleave", function () {
            d3.selectAll(".highlightRectCol").attr("fill", "white");
            d3.selectAll(".highlightRect").attr("fill", "white");
            deHighlightInteractionEdges();
          });

        rowLegend.append("line").attr({
          x1: -(leftPadding + leftSpaceForDegreeGroup),
          y1: highlightYPos,
          // "x2": -(leftPadding+leftSpaceForDegreeGroup) + guiParams.setMatrixEndX - 5,
          x2:
            guiParams.fontSize * (numSets + 1) +
            (leftPadding + leftSpaceForDegreeGroup),
          y2: highlightYPos,
          stroke: "black",
          "stroke-width": "0.5px",
        });

        var participatingBaseSetsIds = "";
        for (var i = 0; i < numSets; i++) {
          var yPos =
            verticalPositionRowHeight[pos][1] -
            verticalPositionRowHeight[pos][0] +
            maxHeightOfNode +
            pos * paddingBetweenNodes +
            tempDistanceFromTop +
            distanceFromAddedRemovedNodes +
            maxHeightOfNode / 2;
          if (!concept.includes("Degree")) {
            rowLegend
              .append("rect")
              .attr({
                x: i * (blockSize + paddingBetweenBlocks),
                y: yPos - blockSize / 2,
                rx: 2,
                ry: 2,
                width: blockSize,
                height: blockSize,
                "stroke-width": "1",
                class: "setMatrixComponent",
                // "stroke":"black"
              })
              .attr("fill", function () {
                if (Math.pow(2, i) & window.hashToBinaryDictionary[concept]) {
                  var setName = posToNameForBaseSetsDictionary[i + 1];
                  participatingBaseSetsIds +=
                    setNameToHashDictionary[setName] + ",";
                  return "grey";
                } else return "lightgrey";
              })
              .attr("stroke", function () {
                if (Math.pow(2, i) & window.hashToBinaryDictionary[concept]) {
                  return "black";
                } else return "grey";
              })
              .attr("stroke-opacity", function () {
                if (Math.pow(2, i) & window.hashToBinaryDictionary[concept]) {
                  return "1";
                } else return "0.3";
              })
              .attr("fill-opacity", function () {
                if (Math.pow(2, i) & window.hashToBinaryDictionary[concept]) {
                  return "1";
                } else return "0.3";
              })
              .on("mouseover", function () {
                var coordinates = d3.mouse(this);
                var x = coordinates[0];
                var y = coordinates[1];
                // console.log(x , y);

                highlightRectsBasedOnPosition(x, y);
              })
              .append("title")
              .text(posToNameForBaseSetsDictionary[i + 1]);

            if (
              start >= 0 &&
              start <= numSets &&
              end >= 0 &&
              end <= numSets &&
              start <= end
            ) {
              rowLegend.append("line").attr({
                x1: start * (blockSize + paddingBetweenBlocks) + blockSize,
                y1: yPos,
                x2: end * (blockSize + paddingBetweenBlocks),
                y2: yPos,
                stroke: "grey",
                "stroke-width": "3",
                class: "setMatrixComponentLine",
              });
            }
          }
        }
        if (concept.includes("Degree")) {
          var degree = parseInt(concept.charAt(6));
          rowLegend
            .append("text")
            .text("All exclusive " + degree + "-set intersections")
            .attr({
              x: -(leftPadding + leftSpaceForDegreeGroup),
              y: yPos + verticalPositionRowHeight[pos][0] / 2 - 3,
              "text-anchor": "start",
              "dominant-baseline": "ideographic",
            });
        }

        d3.select("#RowId" + concept).attr(
          "baseSets",
          participatingBaseSetsIds
        );
      }
      rowLegend.attr(
        "transform",
        "translate(" + (2 * leftPadding + leftSpaceForDegreeGroup) + ",0)"
      );
      ksetRowGroup.attr("transform", "translate(" + 0 + ",0)");

      //  draw Degree Distribution
      var degreeDistributionRow = graphScrollGroup.append("g");
      window.degreeDistributionPerTimeStep = {};

      var maxObjectsInAnyDegree = -1;
      for (var i = 0; i < inputRawData.length; i++) {
        degreeDistributionPerTimeStep[i] = {};

        for (var set in inputRawData[i]) {
          if (!(set === "added" || set === "removed")) {
            var tempDeg = inputRawData[i][set].degree;
            var num = inputRawData[i][set].exclusive.length;
            if (tempDeg in degreeDistributionPerTimeStep[i]) {
              degreeDistributionPerTimeStep[i][tempDeg].count += num;
              degreeDistributionPerTimeStep[i][tempDeg].objects.push(
                inputRawData[i][set].exclusive
              );
            } else {
              degreeDistributionPerTimeStep[i][tempDeg] = {
                count: num,
                objects: copy(inputRawData[i][set].exclusive),
              };
            }
          }
          for (var j = 1; j <= window.numSets; j++) {
            if (!(j in degreeDistributionPerTimeStep[i]))
              window.degreeDistributionPerTimeStep[i][j] = {
                count: 0,
                objects: [],
              };
          }
        }

        for (var deg in degreeDistributionPerTimeStep[i]) {
          if (
            degreeDistributionPerTimeStep[i][deg].count > maxObjectsInAnyDegree
          )
            maxObjectsInAnyDegree = degreeDistributionPerTimeStep[i][deg].count;
        }
      }
      var xscale = d3.scale.ordinal().domain(Object.keys(degreeDictionary));

      // var extendWidthEachSideBy = widthOfNode/4;
      var extendWidthEachSideBy = 0;

      for (var i = 0; i < inputRawData.length; i++) {
        xscale.rangeRoundBands(
          [
            i * widthOfOneZone + widthOfOneZone / 2 - extendWidthEachSideBy,
            i * widthOfOneZone +
              widthOfOneZone / 2 +
              widthOfNode +
              extendWidthEachSideBy,
          ],
          0.1
        );

        var yscale = d3.scale
          .linear()
          .domain([0, maxObjectsInAnyDegree])
          .range([0, heightOfDegreeDistributionBox]);
        for (var deg in degreeDistributionPerTimeStep[i]) {
          degreeDistributionRow.append("rect").attr({
            x: function () {
              return xscale(deg);
            },
            y:
              topPadding +
              heightOfDegreeDistributionBox -
              yscale(degreeDistributionPerTimeStep[i][deg].count),
            width: xscale.rangeBand(),
            height: function () {
              return yscale(degreeDistributionPerTimeStep[i][deg].count);
            },
            fill: "grey",
          });

          degreeDistributionRow
            .append("rect")
            .attr({
              x: function () {
                return xscale(deg);
              },
              y: topPadding,
              width: xscale.rangeBand(),
              height: heightOfDegreeDistributionBox,
              fill: "none",
              class: "hoverOverlayDegree",
              // "class": "hoverOverlay",
              timestep: i,
              degree: deg,
            })
            .on("mouseenter", function () {
              var coordinates = d3.mouse(this);
              // var x = coordinates[0];
              var y = coordinates[1];

              var timestep = d3.select(this).attr("timestep");
              var deg = d3.select(this).attr("degree");
              var x =
                parseInt(timestep) * widthOfOneZone +
                widthOfOneZone / 2 -
                extendWidthEachSideBy;
              var objectArray =
                window.degreeDistributionPerTimeStep[timestep][deg].objects;
              var objectArrayCurated = [];
              for (var ob of objectArray) {
                if ("objectid" in ob) objectArrayCurated.push(ob);
                else if (Array.isArray(ob)) {
                  for (ob2 of ob) {
                    objectArrayCurated.push(ob2);
                  }
                }
              }
              elementNamesOnMouseOver(objectArrayCurated, [x, y]);
            })
            .on("mouseout", function () {
              d3.select("#elementNamesOnMouseOverGroup").remove();
            })
            .on("click", function () {
              var timestep = parseInt(d3.select(this).attr("timestep"));
              var degree = parseInt(d3.select(this).attr("degree"));

              var objectArray =
                window.degreeDistributionPerTimeStep[timestep][degree].objects;
              var objectArrayCurated = [];
              for (var ob of objectArray) {
                if ("objectid" in ob) objectArrayCurated.push(ob);
                else if (Array.isArray(ob)) {
                  for (ob2 of ob) {
                    objectArrayCurated.push(ob2);
                  }
                }
              }
              if ($(`#radioSelection`).prop("checked")) {
                drawDetails("node", objectArrayCurated, timestep);
              } else selectionPanel.select("k-set intersections", getContainedBaseSetsFromSetId(undefined), vis.getTimesteps()[timestep], degree);
            })
            .append("title")
            .text(function () {
              var wt = degreeDistributionPerTimeStep[i][deg].count;
              if (wt == 1)
                return (
                  wt + " element in exclusive " + deg + "-set intersections"
                );
              else
                return (
                  wt + " elements in exclusive " + deg + "-set intersections"
                );
            });
        }
        degreeDistributionRow.append("rect").attr({
          x: i * widthOfOneZone + widthOfOneZone / 2 - extendWidthEachSideBy,
          y: topPadding,
          width: widthOfNode + 2 * extendWidthEachSideBy,
          height: heightOfDegreeDistributionBox,
          fill: "none",
          stroke: "black",
          "stroke-width": "0.5px",
        });
      }
      // degreeDistributionRow.attr("transform","translate("+(leftPadding+guiParams.ksetGroupWidth-widthOfOneZone/4)+",0)");
      // var temBox = d3.select(".ksetIntersectionLabel").node().getBBox();
      // window.shiftMainVisByX = temBox.width;
      degreeDistributionRow.attr(
        "transform",
        "translate(" + window.shiftMainVisByX + ",0)"
      );
      // degreeDistributionRow.attr("transform","translate("+(guiParams.ksetGroupWidth -widthOfOneZone/4)+",0)");

      // Draw timestep labels
      var timestepLabel = graphScrollGroup.append("g");

      for (var i = 0; i < inputRawData.length; i++) {
        var labelXpos =
          widthOfOneZone * i + widthOfOneZone / 2 + widthOfNode / 2;
        var labelYpos =
          topPadding + heightOfDegreeDistributionBox + maxHeightOfNode;

        if (window.currentDatasetId == "tech") labelYpos += maxHeightOfNode;

        // console.log(window.filenames[i]);
        var tlabel = timestepLabel
          .append("text")
          .text(function () {
            return window.filenames[i];
          })
          .attr({
            x: labelXpos,
            y: labelYpos,
            "text-anchor": "middle",
            timestepIndex: i,
            cursor: "pointer",
            class: "timestepLabel",
            // "stroke":"none",
            visibility: "hidden",
          });

        var bbox = tlabel.node().getBBox();
        var extra = 10;
        timestepLabel.append("rect").attr({
          x: labelXpos - bbox.width / 2 - extra,
          y: function () {
            if (window.currentDatasetId != "image")
              return labelYpos - bbox.height / 2 - extra;
            else return labelYpos - bbox.height + extra / 2;
          },
          fill: guiParams.highlightColor,
          visibility: "hidden",
          width: bbox.width + 2 * extra,
          height: function () {
            if (window.currentDatasetId != "image")
              return bbox.height + 2 * extra;
            else return 2 * bbox.height;
          },
          opacity: guiParams.highlightOpacity,
          id: "timestepBackground" + i,
        });

        var tlabel = timestepLabel
          .append("text")
          .text(function () {
            return window.filenames[i];
          })
          .attr({
            x: labelXpos,
            y: labelYpos,
            "text-anchor": "middle",
            "dominant-baseline": "middle",
            timestepIndex: i,
            cursor: "pointer",
            class: "timestepLabel",
            sort: function () {
              if (
                window.selectedTimestepForSorting == undefined ||
                window.selectedTimestepForSorting != i
              )
                return "false";
              else if (window.selectedTimestepForSorting == i) return "true";
            },
          });

        if (
          window.selectedTimestepForSorting == i &&
          window.sortBy == "timestep"
        )
          timestepLabel
            .append("svg:image")
            .attr("x", bbox.x + bbox.width)
            .attr("y", labelYpos - 20)
            .attr("width", 20)
            .attr("height", 30)
            .attr("class", "sortIcon")
            .attr("xlink:href", "images/downArrow.png");
      }

      $(".timestepLabel").on("click", function (e) {
        var sorted = $(this).attr("sort");
        if (sorted == "false") {
          var timestepIndex = parseInt(d3.select(this).attr("timestepIndex"));
          window.sortBy = "timestep";
          window.selectedTimestepForSorting = timestepIndex;
          // visObject = DynaSet().loadHarcodedDatasetFromJavascriptObject(datasetSelection.currentId, timestepIndex);
          deconstructGui();
          computeGraphStructure();

          computeGraphLayout();
          d3.selectAll(".ksetIntersectionLabel").attr("visibility", "hidden");
          updateSelectedGroupEdges();
          computeAndDrawGroupEdges(window.selectedElement, "0");
        } else {
          removeSorting();
        }
      });

      if (datasetSelection.currentId === "image") {
        var accuracyLabel = graphScrollGroup.append("g");
        for (var i = 0; i < inputRawData.length; i++) {
          var tempg = timestepLabel
            .append("text")
            .text(function () {
              var floatAccuracy =
                parseFloat(
                  window.datasets.image.imageClassificationAccuracy[i]
                ) * 100;
              return "(acc.: " + floatAccuracy.toFixed(1) + "%)";
            })
            .attr({
              x: widthOfOneZone * i + widthOfOneZone / 2 + widthOfNode / 2,
              y:
                topPadding +
                heightOfDegreeDistributionBox +
                maxHeightOfNode +
                20,
              "text-anchor": "middle",
            });
        }
      }
      // timestepLabel.attr("transform","translate("+(leftPadding+guiParams.ksetGroupWidth-widthOfOneZone/4)+",0)");
      timestepLabel.attr(
        "transform",
        "translate(" + window.shiftMainVisByX + ",0)"
      );
    }

    // Start drawing
    var mainSvg = d3
      .select("#mainVisualization")
      .append("svg")
      .attr({
        width: width + 200,
        height: height * 4,
      });

    var svg = mainSvg.append("g").attr("id", "mainGroup");

    // var graphScrollGroup = svg.append("g").attr("id", "graphScrollGroup");
    var graphScrollGroup = svg;
    var blockSize = 10;
    var paddingBetweenBlocks = 10;

    drawLeftColumn(svg, svg);

    // Draw the graph
    window.distanceAfterWhichEdgesCurve = widthOfOneZone / 4;
    window.graphGroup = graphScrollGroup.append("g").attr("id", "graph");

    // draw edges
    var minEdgeWeight = 99999;
    var maxEdgeWeight = -1;
    for (var i = 0; i < edges.length; i++) {
      var wt = edges[i].objects.length;
      if (minEdgeWeight > wt) minEdgeWeight = wt;
      if (maxEdgeWeight < wt) maxEdgeWeight = wt;
    }

    var maxNodeWeight = -1;
    var minNodeWeight = 999999;
    for (var nodeId in window.nodes) {
      var wt = window.nodes[nodeId].weight;
      if (minNodeWeight > wt) minNodeWeight = wt;
      if (maxNodeWeight < wt) maxNodeWeight = wt;
    }
    // var edgeThicknessScale = d3.scale.linear().domain([0,minEdgeWeight, d3.max([maxEdgeWeight, maxNodeWeight])]).range([0, 2,maxHeightOfNode]);
    if (window.edgeThicknessScale == undefined) {
      window.maxUnaggregatedWeight = maxNodeWeight;
      window.edgeThicknessScale = d3.scale
        .linear()
        .domain([0, d3.max([maxEdgeWeight, maxNodeWeight])])
        .range([0, maxHeightOfNode]);
    }
    var rearrangedEdges = reorderEdges(edges);
    var unArrangedEdges = copy(edges);
    edges = rearrangedEdges;

    // Adjust y of node according to the visualization
    for (var node in window.nodes) {
      var wt = 0;
      if (node.includes("added")) {
        if ("outedges" in window.nodes[node]) {
          for (var k = 0; k < window.nodes[node].outedges.length; k++) {
            wt += window.nodes[node].outedges[k].objects.length;
          }
        } else wt = 0;
      } else if (node.includes("removed")) {
        if ("inEdgesForRemovedNode" in window.nodes[node]) {
          for (
            var k = 0;
            k < window.nodes[node].inEdgesForRemovedNode.length;
            k++
          ) {
            wt += window.nodes[node].inEdgesForRemovedNode[k].objects.length;
          }
        } else wt = 0;
      }
      // wt = inputRawData[window.nodes[node].timestep][node.substr(3,node.length)].exclusive.length;
      else wt = window.nodes[node].weight;

      window.nodes[node].contentyBottom =
        window.nodes[node].y + maxHeightOfNode - edgeThicknessScale(wt);
      window.nodes[node].contentyCentre =
        window.nodes[node].y + (maxHeightOfNode - edgeThicknessScale(wt)) / 2;
      window.nodes[node].contentWidth = widthOfNode;
      window.nodes[node].y = window.nodes[node].contentyBottom;
      // window.nodes[node].y = window.nodes[node].contentyCentre;
      // console.log(window.nodes[node].yBoundary, window.nodes[node].contentyBottom, window.nodes[node].contentyCentre, window.nodes[node].y);
    }

    // calculate inedges for every node to order the edges properly
    for (var i = 0; i < edges.length; i++) {
      var source = edges[i].from;
      var destination = edges[i].to;
      var inedges = "inedges";
      var outedges = "outedges";
      if (nodesAtAdjacentTimesteps(source, destination)) {
        if (!(inedges in window.nodes[destination])) {
          window.nodes[destination].inedges = {
            comingup: [],
            comingdown: [],
            same: [],
          };
        }
        if (inedges in window.nodes[destination]) {
          var direction = "";
          if (source.slice(3) === destination.slice(3)) direction = "same";
          else if (window.nodes[source].y > window.nodes[destination].y)
            direction = "comingup";
          else direction = "comingdown";

          window.nodes[destination].inedges[direction].push(edges[i]);
        }
      }
    }

    // sort incoming edges within each category for a node
    for (var node in window.nodes) {
      if ("indedges" in window.nodes[node]) {
        // var tempUnsortedEdges = window.nodes[node].comingdown;
        // var sortedEdges = sortEdgeBasedOnDestinationYLocation(tempUnsortedEdges, "doesntmatter");
        window.nodes[node].comingdown = copy(
          sortIncomingEdgeBasedOnDestinationYLocation(
            window.nodes[node].comingdown,
            "doesntmatter"
          )
        );
        window.nodes[node].same = copy(
          sortIncomingEdgeBasedOnDestinationYLocation(
            window.nodes[node].same,
            "doesntmatter"
          )
        );
        window.nodes[node].comingup = copy(
          sortIncomingEdgeBasedOnDestinationYLocation(
            window.nodes[node].comingup,
            "doesntmatter"
          )
        );
      }
    }

    var nonConsecutiveEdgesOverTimesteps = [];

    for (
      var i = 0;
      i < edges.length;
      i++
    ) // for(var i=edges.length-1; i>=0; i--)
    {
      var source = edges[i].from;
      var destination = edges[i].to;

      if (nodesAtAdjacentTimesteps(source, destination)) {
        var inedges = "inedges";
        var outedges = "outedges";

        var y1 = window.nodes[source].y;
        var tempy1 = 0;
        if (!(outedges in window.nodes[source])) {
          window.nodes[source].outedges = [];
        }

        var tempweights = 0;
        for (var j = 0; j < window.nodes[source].outedges.length; j++) {
          tempweights += window.nodes[source].outedges[j].objects.length;
        }
        // console.log(tempweights, edgeThicknessScale(tempweights));
        y1 += edgeThicknessScale(tempweights);

        window.nodes[source].outedges.push(edges[i]);

        if (destination.includes("removed")) {
          if (!("inEdgesForRemovedNode" in window.nodes[destination]))
            window.nodes[destination]["inEdgesForRemovedNode"] = [];
          window.nodes[destination]["inEdgesForRemovedNode"].push(edges[i]);
        }

        var y2 = window.nodes[destination].y;

        var direction = "";
        if (source.slice(3) === destination.slice(3)) direction = "same";
        else if (window.nodes[source].y > window.nodes[destination].y)
          direction = "comingup";
        else direction = "comingdown";

        var returnedWeight = findY2Weight(
          window.nodes[destination],
          direction,
          edges[i].id
        );
        // console.log(returnedWeight, edgeThicknessScale(returnedWeight), window.nodes[destination], direction, edges[i].id);

        y2 += edgeThicknessScale(returnedWeight);

        var x1 = window.nodes[source].x + widthOfNode;

        var x2 = window.nodes[destination].x;

        // var p1x = (x2-x1)/3 + x1;
        // var p1y = (y2-y1)/3 + y1;
        // var p2x = 2*((x2-x1)/3) + x1;
        // var p2y = 2*((y2-y1)/3) + y1;

        var p1x = x1 + distanceAfterWhichEdgesCurve;
        var p1y = y1;
        var p2x = x2 - distanceAfterWhichEdgesCurve;
        var p2y = y2;

        // tempy1 += edgeThicknessScale(tempweights);

        if (source.includes("added")) {
          var tempweights = 0;
          var tempoutedges = window.nodes[source].outedges;
          for (var k = 0; k < tempoutedges.length - 1; k++) {
            // if(tempoutedges[k].id != edges[i].id )
            // // if(tempoutedgeids.indexOf(i)>k)
            // {
            tempweights += tempoutedges[k].objects.length;
            // }
          }
          x1 =
            window.nodes[source].x +
            edgeThicknessScale(tempweights) +
            edgeThicknessScale(edges[i].objects.length) / 2;
          // x1 = window.nodes[source].x + tempy1;
          // x1 = window.nodes[source].x + (y1 - window.nodes[source].y) + edgeThicknessScale(edges[i].objects.length)/2;
          y1 = window.nodes[source].y;
          p1x = x1;
          p1y = window.nodes[destination].y;
          p2x = p1x;
          p2y = p1y;
          // console.log(edges[i].objects.length, window.nodes[source].x, edgeThicknessScale(tempweights), x1, edgeThicknessScale(edges[i].objects.length));
        } else {
          y1 = y1 + edgeThicknessScale(edges[i].objects.length) / 2;
        }

        if (destination.includes("removed")) {
          x2 = window.nodes[destination].x + (y2 - window.nodes[destination].y);
          +edgeThicknessScale(edges[i].objects.length) / 2;
          y2 = window.nodes[destination].y;
          p1x = (x1 + x2) / 2;
          // p1y = window.nodes[destination].y;
          p2x = x2;
          p2y = p1y + distanceAfterWhichEdgesCurve;
        } else {
          y2 = y2 + edgeThicknessScale(edges[i].objects.length) / 2;
        }

        if (nodesAreSameSetsInDifferentTimesteps(source, destination)) {
          p1x = p2x = x1;
          p1y = p2y = y1;
        }

        var classOfEdge = "";
        if (source.includes("added")) classOfEdge += "added ";
        else if (destination.includes("removed")) classOfEdge += "removed ";
        else if (nodesAreSameSetsInDifferentTimesteps(source, destination)) {
          if (nodesAtAdjacentTimesteps(source, destination))
            classOfEdge += "consecutive ";
          else classOfEdge += "non-consecutive ";
        } else {
          if (nodesAtAdjacentTimesteps(source, destination))
            classOfEdge += "moved ";
        }
        edges[i]["x1"] = x1;
        edges[i]["y1"] = y1;
        edges[i]["x2"] = x2;
        edges[i]["y2"] = y2;
        edges[i]["p1x"] = p1x;
        edges[i]["p1y"] = p1y;
        edges[i]["p2x"] = p2x;
        edges[i]["p2y"] = p2y;
        edges[i]["class"] = "edge " + classOfEdge;
        edges[i]["type"] = "consecutive";

        // graphGroup.append("path").classed("edge",true).attr("id",edges[i].id).classed(classOfEdge, true).attr({
        //     "d": "M "+x1+" "+y1+" C "+p1x+" "+p1y + ", "+p2x+" "+p2y+", "+x2+" "+y2,
        // "stroke":"lightblue",
        // "opacity":"0.5"
        // }).attr("stroke-width", function(){
        //     return edgeThicknessScale(edges[i].objects.length);
        // })
        // .append("title").text(function(){return edges[i].objects.length;});

        // svg.append("circle").attr({
        //     "cx":x1,
        //     "cy":y1,
        //     "r":2,
        //     "stroke":"black"
        // })
        // svg.append("circle").attr({
        //     "cx":x2,
        //     "cy":y2,
        //     "r":2,
        //     "stroke":"black"
        // })
      } else {
        //console.log(source, destination, edges[i].objects);
        var sourceTimestep = source.substring(1, source.indexOf("N"));
        var destinationTimestep = destination.substring(
          1,
          destination.indexOf("N")
        );
        nonConsecutiveEdgesOverTimesteps.push([
          sourceTimestep,
          destinationTimestep,
          edgeThicknessScale(edges[i].objects.length),
        ]);
        var a;
        // TODO: draw edges that are non-consecutive
        // console.log(edges[i]);
        // x1 = window.nodes[source].x + edgeThicknessScale(tempweights) + edgeThicknessScale(edges[i].objects.length)/2;
        // x1 = window.nodes[source].x + tempy1;
        // x1 = window.nodes[source].x + (y1 - window.nodes[source].y) + edgeThicknessScale(edges[i].objects.length)/2;
        y1 =
          window.nodes[source].y +
          edgeThicknessScale(edges[i].objects.length) / 2;
        var x1 = window.nodes[source].x + widthOfNode;

        var x2 = window.nodes[destination].x;

        var t = computeOverlapOfEdges(
          nonConsecutiveEdgesOverTimesteps,
          sourceTimestep,
          destinationTimestep
        );
        // var p1y = window.nodes[source].yBoundary + maxHeightOfNode +  paddingBetweenBlocks;
        var p1x = x1 + distanceAfterWhichEdgesCurve / 2 + t;

        var p1y =
          window.nodes["T0Nadded"].y +
          maxHeightOfNode +
          paddingBetweenBlocks -
          t;
        var p2x = x2 - distanceAfterWhichEdgesCurve / 2;
        var p2y = p1y;
        var y2 =
          window.nodes[destination].y +
          edgeThicknessScale(edges[i].objects.length) / 2;

        classOfEdge = "nonconsecutive";
        edges[i]["x1"] = x1;
        edges[i]["y1"] = y1;
        edges[i]["x2"] = x2;
        edges[i]["y2"] = y2;
        edges[i]["p1x"] = p1x;
        edges[i]["p1y"] = p1y;
        edges[i]["p2x"] = p2x;
        edges[i]["p2y"] = p2y;
        edges[i]["class"] = "edge " + classOfEdge;
        edges[i]["type"] = "nonconsecutive";
      }
    }

    // Interaction Edges Position Computation

    window.interactionEdges_MergedGrouped = [];
    for (var e of window.interactionEdges) {
      if (e.timestep in interactionEdges_MergedGrouped) {
        interactionEdges_MergedGrouped[e.timestep].push(e);
      } else {
        interactionEdges_MergedGrouped[e.timestep] = new Array(e);
      }
    }

    var edgesCounter = 1;
    for (var time in interactionEdges_MergedGrouped) {
      for (var e of interactionEdges_MergedGrouped[time]) {
        e.positions = [];
        e.positionOrder = [];
        e.nodePositionDict = {};
        e.edgeId = "IEdge" + edgesCounter++;
        e.nodes.forEach((conceptId) => {
          e.positionOrder.push(guiParams.verticalPosition[conceptId]);
          var node = "T" + e.timestep + "N" + conceptId;
          var coords = [
            window.nodes[node].xBoundary,
            window.nodes[node].yBoundary,
          ];
          e.positions.push(coords);
          e.nodePositionDict[conceptId] = coords;
        });
        e.minOrder = d3.min(e.positionOrder);
        e.maxOrder = d3.max(e.positionOrder);
      }
    }

    for (var time in interactionEdges_MergedGrouped) {
      // interactionEdges_MergedGrouped[time].sort(function(a,b){
      //     return lengthOfInteractionEdge(a) - lengthOfInteractionEdge(b)
      // });
      interactionEdges_MergedGrouped[time].sort(function (a, b) {
        var diff = minPosOfEdge(a) - minPosOfEdge(b);
        if (diff == 0) {
          return lengthOfInteractionEdge(a) - lengthOfInteractionEdge(b);
        } else return diff;
      });
    }

    // Bin packing
    var interactionEdges_MergedGroupedBinned = {};

    for (var time in interactionEdges_MergedGrouped) {
      interactionEdges_MergedGroupedBinned[time] = [];

      for (var e of interactionEdges_MergedGrouped[time]) {
        if (e.nodes.size > 1) {
          var overlapFlag = false;
          var edgePushedInBin = false;
          var binIndex = 0;
          for (
            var x = 0;
            x < interactionEdges_MergedGroupedBinned[time].length;
            x++
          ) {
            var edgesInBin = interactionEdges_MergedGroupedBinned[time][x];
            overlapFlag = false;
            binIndex = 0;
            for (var e2 of edgesInBin) {
              if (
                (e.minOrder >= e2.minOrder && e.minOrder < e2.maxOrder) ||
                (e.maxOrder <= e2.maxOrder && e.maxOrder > e2.minOrder)
              ) {
                overlapFlag = true;
                binIndex = x;
              } else binIndex = x;
            }
            if (overlapFlag == false && edgePushedInBin == false) {
              interactionEdges_MergedGroupedBinned[time][x].push(e);
              edgePushedInBin = true;
            }
          }
          if (edgePushedInBin == false) {
            interactionEdges_MergedGroupedBinned[time].push([e]);
          }
        }
      }
    }

    window.interactionEdges = [];
    window.interactionEdgesSelfLoop = [];

    // Calculating position after binpacking
    var countDict = getMaxCountOfInteractionEdges(
      interactionEdges_MergedGrouped
    );
    var temThickness = edgeThicknessScale(countDict.maxCount);

    // if(temThickness > (guiParams.hyperEdgeCircleRadius*2))
    // guiParams.hyperEdgeCircleRadius = temThickness/2;

    // if(window.currentDatasetId == "tech")
    //     guiParams.hyperEdgeCircleRadius = 5;

    for (var time in interactionEdges_MergedGroupedBinned) {
      for (
        var binIndex = 0;
        binIndex < interactionEdges_MergedGroupedBinned[time].length;
        binIndex++
      ) {
        var edgesInBin = interactionEdges_MergedGroupedBinned[time][binIndex];
        for (var ii = 0; ii < edgesInBin.length; ii++) {
          var e = edgesInBin[ii];
          if (e.nodes.size > 1) {
            // calculate unique elements
            var uniqueElements = computeUniqueElements(e);
            e.numUniqueElements = Object.keys(uniqueElements).length;
            e.uniqueElements = uniqueElements;

            var t =
              guiParams.nodeBarWidth +
              2 * guiParams.hyperEdgeCircleRadius +
              guiParams.hyperEdgeCircleRadius * 2.5 * binIndex;
            var yShift = window.maxHeightOfNode / 6;
            // var yShift = 0;
            var minIndex = e.positionOrder.indexOf(d3.min(e.positionOrder));
            var maxIndex = e.positionOrder.indexOf(d3.max(e.positionOrder));
            e.x1 = e.positions[minIndex][0] + t;
            e.y1 = e.positions[minIndex][1] + 5 * yShift;
            e.x2 = e.positions[maxIndex][0] + t;
            e.y2 = e.positions[maxIndex][1] + yShift;
            var classString = "interactionEdges " + e.edgeId;
            e.nodes.forEach(
              (conceptId) => (classString = classString + " I" + conceptId)
            );
            e.class = classString;
            e.circlePositions = [];

            for (var jj = 0; jj < e.positions.length; jj++) {
              var pos = e.positions[jj];
              var yShift2 = 0;
              if (e.positionOrder.indexOf(d3.min(e.positionOrder)) == jj)
                yShift2 = 5 * yShift;
              else if (e.positionOrder.indexOf(d3.max(e.positionOrder)) == jj)
                yShift2 = yShift;
              else yShift2 = 3 * yShift;
              var conceptId = Array.from(e.nodes)[jj];
              e.circlePositions.push([pos[0] + t, pos[1] + yShift2]);
            }
            e.circleClass =
              "interactionEdgesCircles " + e.edgeId + " C" + conceptId;
            window.interactionEdges.push(e);
          }
        }
      }
    }

    // Calculating positions for self loop interaction edges
    for (var time in interactionEdges_MergedGrouped) {
      for (var e of interactionEdges_MergedGrouped[time]) {
        if (e.nodes.size == 1) {
          // calculate unique elements
          var uniqueElements = computeUniqueElements(e);
          e.numUniqueElements = Object.keys(uniqueElements).length;
          e.uniqueElements = uniqueElements;

          var displacement = 10;
          // var w = interactionEdgeThicknessScale(e.count);
          var w = edgeThicknessScale(e.count);
          var xpos = e.positions[0][0] + widthOfNode - w;
          var ypos = e.positions[0][1] - displacement;

          var h = displacement;
          var xpos2 = xpos + w / 2;
          var ypos2 = ypos + h / 2;
          e.x = xpos;
          e.y = ypos;
          e.width = w;
          e.height = h;
          var classString = "interactionEdges " + e.edgeId;
          e.nodes.forEach(
            (conceptId) => (classString = classString + " I" + conceptId)
          );
          e.class = classString;

          window.interactionEdgesSelfLoop.push(e);
        }
      }
    }
    drawEdges(edges);

    for (var node in window.nodes) {
      var nodehash = node.substr(3, node.length);
      var wt = 0;
      var h = 0;

      var classOfNode = "";
      if (nodehash === "added") classOfNode += "addedNode ";
      else if (nodehash === "removed") classOfNode += "removedNode ";
      else classOfNode += "normalNode ";

      if (nodehash === "added" || nodehash === "removed") {
        h = maxHeightOfNode;
      } else {
        // wt = inputRawData[window.nodes[node].timestep][nodehash].exclusive.length;
        wt = window.nodes[node].weight;
        h = edgeThicknessScale(wt);
      }

      window.nodes[node]["height"] = h;
      // window.nodes[node]["weight"] = wt;
      window.nodes[node]["class"] = classOfNode;
    }

    // draw nodes
    var nodeDataArray = [];
    for (var node in window.nodes) {
      nodeDataArray.push(window.nodes[node]);
    }

    var nodeGroup = graphGroup.append("g");

    // TODO: workaround for quick bugfix -> replace by clean solution
    var nodeDataArrayCleaned = nodeDataArray.filter((d) => {
      return d.weight > 0;
    });

    var nodeCreate = nodeGroup
      .selectAll("rect")
      .data(nodeDataArrayCleaned)
      .enter();

    nodeCreate.append("rect").attr({
      x: function (d) {
        return d.xBoundary;
      },
      y: function (d) {
        if (d.nodeId.charAt(2) == "N") return d.yBoundary;
        else {
          var hash = "Degree" + d.nodeId.charAt(3);
          return (
            d.y -
            (verticalPositionRowHeight[verticalPosition[hash]][0] - d.height)
          );
        }
      },
      width: widthOfNode,
      height: function (d) {
        var hash = 0;
        if (d.nodeId.charAt(2) == "N") hash = d.setid;
        else if (d.nodeId.charAt(2) == "D") {
          var hash = "Degree" + d.nodeId.charAt(3);
        }
        return verticalPositionRowHeight[verticalPosition[hash]][0];
      },
      // "fill": "none",
      fill: "#efe6e6",
      opacity: 0.6,
      // "stroke": "black",
      class: function (d) {
        return d.class;
      },
    });

    // Black surrounding box
    nodeCreate.append("rect").attr({
      id: function (d) {
        return d.nodeId;
      },
      x: function (d) {
        return d.x;
      },
      y: function (d) {
        return d.yBoundary;
      },
      // "width": widthOfNode,
      width: guiParams.nodeBarWidth,
      height: function (d) {
        return maxHeightOfNode;
      },
      class: function (d) {
        return "nodeBarBoundary";
      },
    });

    nodeCreate.append("rect").attr({
      id: function (d) {
        return d.nodeId;
      },
      x: function (d) {
        return d.x;
      },
      y: function (d) {
        return d.y;
      },
      // "width": widthOfNode,
      width: guiParams.nodeBarWidth,
      height: function (d) {
        return d.height;
      },
      class: function (d) {
        return "node " + d.class;
      },
    });

    // Black surrounding box
    nodeCreate.append("rect").attr({
      id: function (d) {
        return d.nodeId;
      },
      x: function (d) {
        return d.x + widthOfNode - guiParams.nodeBarWidth;
      },
      y: function (d) {
        return d.yBoundary;
      },
      // "width": widthOfNode,
      width: guiParams.nodeBarWidth,
      height: function (d) {
        return maxHeightOfNode;
      },
      class: function (d) {
        return "nodeBarBoundary";
      },
    });

    nodeCreate.append("rect").attr({
      id: function (d) {
        return d.nodeId;
      },
      x: function (d) {
        return d.x + widthOfNode - guiParams.nodeBarWidth;
      },
      y: function (d) {
        return d.y;
      },
      // "width": widthOfNode,
      width: guiParams.nodeBarWidth,
      height: function (d) {
        return d.height;
      },
      class: function (d) {
        return "node " + d.class;
      },
    });
    // nodeCreate.append("rect")
    // .attr({
    //     "id": function (d) { return d.nodeId; },
    //     "x": function (d) { return d.x; },
    //     "y": function (d) { return d.yBoundary + maxHeightOfNode; },
    //     "width": widthOfNode,
    //     "height": function (d) { return "1px";},
    //     "class": function (d) { return "node " + d.class; }
    // })

    nodeCreate
      .append("rect")
      .attr({
        x: function (d) {
          return d.xBoundary;
        },
        y: function (d) {
          if (d.nodeId.charAt(2) == "N") return d.yBoundary;
          else {
            var hash = "Degree" + d.nodeId.charAt(3);
            return (
              d.y -
              (verticalPositionRowHeight[verticalPosition[hash]][0] - d.height)
            );
          }
        },
        width: widthOfNode,
        height: function (d) {
          var hash = 0;
          if (d.nodeId.charAt(2) == "N") hash = d.setid;
          else if (d.nodeId.charAt(2) == "D") {
            var hash = "Degree" + d.nodeId.charAt(3);
          }
          return verticalPositionRowHeight[verticalPosition[hash]][0];
        },
        setid: function (d) {
          return d.setid;
        },
        rowId: function (d) {
          return d.setid;
        },
        degree: function (d) {
          return d.degree;
        },
        class: function (d) {
          return d.class + " hoverOverlay";
        },
      })
      .on("click", function (d) {
        var setid = d3.select(this).attr("setid");
        var objects = inputRawData[d.timestep][setid].exclusive;
        if ($(`#radioSelection`).prop("checked")) {
          drawDetails("node", objects, d.timestep, [], setid);
        } else {
          if (d.nodeId.charAt(2) == "N")
            selectionPanel.select(
              "exclusive intersection",
              getContainedBaseSetsFromSetId(d.setid),
              vis.getTimesteps()[d.timestep],
              1
            );
          else if (d.nodeId.charAt(2) == "D") {
            selectionPanel.select(
              "k-set intersections",
              getContainedBaseSetsFromSetId(d.setid),
              vis.getTimesteps()[d.timestep],
              d.degree
            );
          }
        }
      })
      .on("mouseenter", function (d) {
        var setid = d3.select(this).attr("setid");
        d3.selectAll(".highlightRect").attr("fill", "white");
        d3.select("#timestepBackground" + d.timestep).attr(
          "visibility",
          "visible"
        );
        highlightInteractionEdge(d3.select(this).attr("rowId"));
        if (setid != null) {
          d3.select(".SetId" + setid).attr("fill", guiParams.highlightColor);
          var baseSets = d3
            .select(".SetId" + setid)
            .attr("baseSets")
            .split(",");
          for (var k = 0; k < baseSets.length; k++) {
            d3.selectAll(".BaseSet" + baseSets[k]).attr(
              "fill",
              guiParams.highlightColor
            );
          }
        } else {
          d3.select(".SetIdDegree" + d.degree).attr(
            "fill",
            guiParams.highlightColor
          );
        }
        elementNamesOnMouseOver(inputRawData[d.timestep][setid].exclusive, [
          d.x,
          d.y,
        ]);
      })
      .on("mouseleave", function (d) {
        var setid = d3.select(this).attr("setid");
        d3.select(".SetId" + d.degree).attr("fill", "white");
        d3.select("#timestepBackground" + d.timestep).attr(
          "visibility",
          "hidden"
        );
        deHighlightInteractionEdges();

        if (setid != null) {
          var baseSets = d3
            .select(".SetId" + setid)
            .attr("baseSets")
            .split(",");
          for (var k = 0; k < baseSets.length - 1; k++)
            d3.selectAll(".BaseSet" + baseSets[k]).attr("fill", "white");
        }
        d3.selectAll(".highlightRectCol").attr("fill", "white");
        d3.selectAll(".highlightRect").attr("fill", "white");
        d3.select("#elementNamesOnMouseOverGroup").remove();
      })
      .append("title")
      .text(function (d) {
        if (d.weight == 1) return d.weight + " element";
        else return d.weight + " elements";
      });

    //  d3.selectAll(".edge").style("display","none");
    //  d3.selectAll(".nonconsecutive").style("display","inline");
    //  d3.selectAll(".nonconsecutive").style("stroke","red");

    //  d3.selectAll(".added").attr("stroke", "lightgreen");
    //  d3.selectAll(".removed").attr("stroke", "#ffc0cb");
    //  d3.selectAll(".consecutive").attr("stroke", "lightgrey");
    //  d3.selectAll(".moved").attr("stroke", "lightblue");

    d3.selectAll(".addedNode").style("display", "none");
    d3.selectAll(".removedNode").style("display", "none");

    window.currentHorizontalPosition = 0;
    window.currentHorizontalPosition = leftPadding;
    window.maxVerticalPosition = 2000;
    window.maxHorizontalPosition = 1000;
    svg.attr("transform", "translate(" + currentHorizontalPosition + ",0)");

    window.timeLabelToIndexDictionary = {};
    for (var i = 0; i < window.filenames.length; i++)
      timeLabelToIndexDictionary[window.filenames[i]] = i;

    for (var i = 0; i < inputRawData.length; i++) {
      for (var setHash in inputRawData[i]) {
        if (!(setHash.includes("added") || setHash.includes("removed"))) {
          var allObjectIds = returnArrayOfObjectIdsFromListOfObjects(
            inputRawData[i][setHash].exclusive
          );
          allObjectIds = allObjectIds.concat(
            returnArrayOfObjectIdsFromListOfObjects(
              inputRawData[i][setHash].shared
            )
          );
          inputRawData[i][setHash]["allElementIds"] = allObjectIds;
        }
      }
    }

    drawInteractionEdges(
      window.interactionEdges,
      window.interactionEdgesSelfLoop
    );

    // graphGroup.attr("transform", "translate("+(leftPadding+guiParams.ksetGroupWidth-widthOfOneZone/4)+",0)");
    graphGroup.attr("transform", "translate(" + window.shiftMainVisByX + ",0)");

    //draw sort option
    var options = svg.append("g");
    guiParams.xposOfTopDropDowns = guiParams.ksetGroupWidth + 50;
    // options.html('<text x="-40" y="25" class="glyphicon" id="sortButton" font-size="20px" cursor="pointer">&#xe155;<title>Sort</title></text>');
    options
      .append("text")
      .attr({
        x: guiParams.xposOfTopDropDowns,
        y: 16,
        // "dominant-baseline":"middle",
        "font-size": "13px",
      })
      .text("Sort by: ");

    var members = [
      {
        label: "K-set intersections",
        value: "degree",
      },
      {
        label: "Stability",
        value: "stability",
      },
      {
        label: "Similarity",
        value: "similarity",
      },
      {
        label: "Number of Interactions",
        value: "numInteractions",
      },
      {
        label: "Cardinality Sum (all timesteps)",
        value: "cumulative",
      },
    ];

    for (var i = 0; i < inputRawData.length; i++) {
      members.push({
        label: "Cardinality in timestep: " + window.filenames[i],
        value: "timestep" + i,
        timestep: i,
      });
    }

    for (var i = 0; i < numSets; i++) {
      const setName = posToNameForBaseSetsDictionary[i + 1];
      members.push({
        label: "Prioritize: " + setName,
        value: "priority" + setNameToHashDictionary[setName],
        setid: setNameToHashDictionary[setName],
      });
    }

    var defaultIndex = -1;
    for (var m = 0; m < members.length; m++) {
      if (members[m].value == window.sortBy) {
        defaultIndex = m;
        break;
      } else if (window.sortBy == "timestep") {
        if (
          members[m].value ==
          "timestep" + window.selectedTimestepForSorting
        ) {
          defaultIndex = m;
          break;
        }
      } else if (window.sortBy == "set_priority") {
        if (members[m].value == "priority" + window.selectedSetIdForPriority) {
          defaultIndex = m;
          break;
        }
      }
    }

    var config = {
      width: 200,
      container: options,
      members,
      defaultSelected: defaultIndex,
      fontSize: 14,
      //   color: "#333",
      //   fontFamily: "calibri",
      x: guiParams.xposOfTopDropDowns + 50,
      y: 3,
      changeHandler: function (option) {
        // "this" refers to the option group
        // Change handler code goes here
        // document.getElementById("selectedInput").value = option.label;
        deconstructGui();
        window.sortBy = option.value;
        if (option.value.includes("timestep")) {
          window.selectedTimestepForSorting = option.timestep;
          window.sortBy = "timestep";
        } else if (option.value.includes("priority")) {
          window.selectedSetIdForPriority = option.setid;
          window.sortBy = "set_priority";
        }
        computeGraphStructure();
        computeGraphLayout();
        updateSelectedGroupEdges();
        computeAndDrawGroupEdges(window.selectedElement, "0");
      },
    };

    svgDropDown(config);

    // drawAggregateOption(svg);

    // Attempting to draw horizontal scroll bar : work in progress
    // var tempGraphWidth = widthOfOneZone*(numTimesteps) - widthOfOneZone/2;

    var tempGraphWidth =
      width -
      guiParams.ksetGroupWidth -
      marginBeforeAndAfterText -
      2 * guiParams.fontSize;
    var renderedWidth = guiParams.widthOfOneZone * numTimesteps;
    window.xPosHorizontalScrollBar =
      guiParams.ksetGroupWidth +
      marginBeforeAndAfterText +
      2 * guiParams.fontSize;
    var scrollBarWidth = tempGraphWidth * (tempGraphWidth / renderedWidth);
    window.currentHorizontalPosition = window.xPosHorizontalScrollBar;
    // d3.select("#mainGroup").append("rect").attr({
    //     "x":window.xPosHorizontalScrollBar,
    //     "y":height,
    //     "width":scrollBarWidth,
    //     "height": 10,
    //     "fill": "grey"
    // }).on("drag", scrollDrag);

    function scrollDrag(d) {
      console.log(d3.event.y, d3.event);
      // window.currentHorizontalPosition += d3.event.y;
      // if (
      //   window.currentHorizontalPosition >= window.xPosHorizontalScrollBar &&
      //   window.currentHorizontalPosition <= _param.differenceOfHeight
      // ) {
      //   d3.select("#mainVisualizationGroup")
      //     .transition()
      //     .attr(
      //       "transform",
      //       "translate(0," + -window.currentHorizontalPosition + ")"
      //     );
      //   d3.select("#scrollBar")
      //     .transition()
      //     .attr(
      //       "transform",
      //       "translate(0," +
      //         window.currentHorizontalPosition * _param.scrollRatio +
      //         ")"
      //     );
      // } else if (window.currentHorizontalPosition < 0) {
      //   window.currentHorizontalPosition = 0;
      //   d3.select("#mainVisualizationGroup")
      //     .transition()
      //     .attr(
      //       "transform",
      //       "translate(0," + -window.currentHorizontalPosition + ")"
      //     );
      //   d3.select("#scrollBar")
      //     .transition()
      //     .attr(
      //       "transform",
      //       "translate(0," +
      //         window.currentHorizontalPosition * _param.scrollRatio +
      //         ")"
      //     );
      // } else if (window.currentHorizontalPosition > _param.differenceOfHeight) {
      //   window.currentHorizontalPosition = _param.differenceOfHeight;
      //   d3.select("#mainVisualizationGroup")
      //     .transition()
      //     .attr(
      //       "transform",
      //       "translate(0," + -window.currentHorizontalPosition + ")"
      //     );
      //   d3.select("#scrollBar")
      //     .transition()
      //     .attr(
      //       "transform",
      //       "translate(0," +
      //         window.currentHorizontalPosition * _param.scrollRatio +
      //         ")"
      //     );
      // }
    }
  }

  function drawAggregateOption(svg) {
    //draw aggregate option
    var options = svg.append("g");
    var xPos = 270 + guiParams.xposOfTopDropDowns;
    // options.html('<text x="-40" y="25" class="glyphicon" id="sortButton" font-size="20px" cursor="pointer">&#xe155;<title>Sort</title></text>');
    var txtElem = options
      .append("text")
      .attr({
        x: xPos,
        y: 16,
        // "dominant-baseline":"middle",
        "font-size": "13px",
      })
      .text("Collapse: ");

    var members = [];

    for (var i = 1; i < window.degreesAggregated.length; i++) {
      if (window.degreesAggregated[i] == 0)
        members.push({
          label: "Exclusive " + i + "-set intersections",
          value: i,
        });
    }
    if (window.degreesAggregated.indexOf(0) > 0) {
      members.push({
        label: "All",
        value: "all",
      });
    }

    var defaultIndex = 0;
    var bbox = txtElem.node().getBBox();

    var config = {
      width: 200,
      container: options,
      members,
      defaultSelected: defaultIndex,
      fontSize: 14,
      x: bbox.x + bbox.width + 10,
      y: 3,
      changeHandler: function (option) {
        // "this" refers to the option group
        // Change handler code goes here
        // document.getElementById("selectedInput").value = option.label;
        if (option.value == "all")
          for (var i = 1; i < window.degreesAggregated.length; i++)
            window.degreesAggregated[i] = 1;
        else window.degreesAggregated[option.value] = 1;

        deconstructGui();
        computeGraphStructure();
        computeGraphLayout();
        updateSelectedGroupEdges();
        computeAndDrawGroupEdges(window.selectedElement, "0");
      },
    };

    svgDropDown(config);
    var xPos2 = bbox.x + bbox.width + 10 + guiParams.xposOfTopDropDowns;
    var txtElem2 = options
      .append("text")
      .attr({
        x: xPos2,
        y: 16,
        // "dominant-baseline":"middle",
        "font-size": "13px",
      })
      .text("Expand: ");

    members = [];

    for (var i = 1; i < window.degreesAggregated.length; i++) {
      if (window.degreesAggregated[i] == 1)
        members.push({
          label: "Exclusive " + i + "-set intersections",
          value: i,
        });
    }
    if (window.degreesAggregated.indexOf(1) > 0) {
      members.push({
        label: "All",
        value: "all",
      });
    }
    defaultIndex = 0;
    bbox = txtElem2.node().getBBox();

    var config2 = {
      width: 200,
      container: options,
      members,
      defaultSelected: defaultIndex,
      fontSize: 14,
      x: bbox.x + bbox.width + 10,
      y: 3,
      changeHandler: function (option) {
        // "this" refers to the option group
        // Change handler code goes here
        // document.getElementById("selectedInput").value = option.label;
        if (option.value == "all")
          for (var i = 1; i < window.degreesAggregated.length; i++)
            window.degreesAggregated[i] = 0;
        else window.degreesAggregated[option.value] = 0;

        deconstructGui();
        computeGraphStructure();
        computeGraphLayout();
        updateSelectedGroupEdges();
        computeAndDrawGroupEdges(window.selectedElement, "0");
      },
    };

    svgDropDown(config2);
  }
  function highlightRects(selection) {
    d3.selectAll(".highlightRect").attr("fill", "white");
    selection.attr("fill", guiParams.highlightColor);
    var baseSets = selection.attr("baseSets");
    if (baseSets != null) {
      baseSets = baseSets.split(",");
      for (var k = 0; k < baseSets.length; k++) {
        d3.selectAll(".BaseSet" + baseSets[k]).attr(
          "fill",
          guiParams.highlightColor
        );
      }
    }
    highlightInteractionEdge(selection.attr("rowId"));
  }
  function removeSorting() {
    window.selectedTimestepForSorting = undefined;
    deconstructGui();
    window.sortBy = guiParams.defaultSorting;
    computeGraphStructure();
    computeGraphLayout();
    // d3.selectAll(".ksetIntersectionLabel").attr("visibility","visible");

    // createElementList();
    // populateAdditionalAttributeArea();
    updateSelectedGroupEdges();
    computeAndDrawGroupEdges(window.selectedElement, "0");
  }

  function computeOverlapOfEdges(
    nonConsecutiveEdgesOverTimesteps,
    sourceTimestep,
    destinationTimestep
  ) {
    var heightAdjustment = 0;
    var padding = 0;
    for (var i = 0; i < nonConsecutiveEdgesOverTimesteps.length; i++) {
      if (
        edgeContained(
          nonConsecutiveEdgesOverTimesteps[i],
          sourceTimestep,
          destinationTimestep
        )
      )
        heightAdjustment += nonConsecutiveEdgesOverTimesteps[i][2] + padding;
    }
    return heightAdjustment;
  }

  function edgeContained(edge, source, destination) {
    var start = parseInt(edge[0]);
    var end = parseInt(edge[1]);
    source = parseInt(source);
    destination = parseInt(destination);
    if (end < source || start > destination) return false;
    else return true;
  }

  function populateAdditionalAttributeArea() {
    d3.select("#highlightedElement").selectAll("*").remove();
    var width = 411,
      height = 205;

    // var width = 326,
    //     height = 205;

    window.selectionWidth = width;
    window.selectionHeight = height;
    // for computer research dataset
    if (datasetSelection.currentLoadedDatasetIndex == 7) {
      // if current dataset is computer researcher

      var mymap = L.map("highlightedElement").setView([0, 0], 0);
      //
      // pk.eyJ1Ijoic2hpdmFtc2hvcCIsImEiOiJjazBlOGVna3MwNnFrM2dtcDlyamVwNDJjIn0.sD2gW27iLKOb5ltdBS778w
      // https://api.mapbox.com/styles/v1/shivamshop/ck0e95jcu0iar1ckfl6yggsvf.html?fresh=true&title=true&access_token=pk.eyJ1Ijoic2hpdmFtc2hvcCIsImEiOiJjazBlOGVna3MwNnFrM2dtcDlyamVwNDJjIn0.sD2gW27iLKOb5ltdBS778w#13.6/37.784020/-122.403944/0
      L.tileLayer(
        "https://api.mapbox.com/styles/v1/shivamshop/ck0ea4z970a9v1cnylu0t6t6i/tiles/256/{z}/{x}/{y}?access_token=pk.eyJ1Ijoic2hpdmFtc2hvcCIsImEiOiJjazBlOGVna3MwNnFrM2dtcDlyamVwNDJjIn0.sD2gW27iLKOb5ltdBS778w",
        {
          maxZoom: 18,
          attribution:
            'Map data &copy; <a href="http://openstreetmap.org">OSM</a>, ' +
            '<a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, ' +
            'Imagery © <a href="http://mapbox.com">Mapbox</a>',
          id: "mapbox.streets",
        }
      ).addTo(mymap);

      var dataForMap = {};
      var objectIdArray = Object.keys(allObjectsInfo);
      for (var i = 0; i < objectIdArray.length; i++) {
        var institutionOfObject =
          authorInfo[allObjectsInfo[objectIdArray[i]].name].institution;
        if (institutionOfObject in universityLocations) {
          var long = universityLocations[institutionOfObject].long;
          var lat = universityLocations[institutionOfObject].lat;
          if (institutionOfObject in dataForMap) {
            dataForMap[institutionOfObject].count++;
          } else {
            dataForMap[institutionOfObject] = {
              lat: lat,
              long: long,
              count: 1,
              name: institutionOfObject,
            };
          }

          // dataForMap.push([long, lat]);
        } else {
          console.log(
            "institution location not found: " +
              institutionOfObject +
              " for author " +
              objectIdArray[i].name
          );
        }
      }

      var dataForMapArray = [];
      var maxCountOfUniversity = -1;
      for (var institute in dataForMap) {
        var cnt = dataForMap[institute]["count"];
        dataForMapArray.push([
          dataForMap[institute]["long"],
          dataForMap[institute]["lat"],
          cnt,
          dataForMap[institute]["name"],
        ]);
        if (cnt > maxCountOfUniversity) maxCountOfUniversity = cnt;
      }
      var minArea = Math.PI * 5 * 5;
      var maxArea = Math.PI * 30 * 30;
      var circleSizeScale = d3.scale
        .linear()
        .domain([1, maxCountOfUniversity])
        .range([minArea, maxArea]);

      //         svg.selectAll("circle")
      //                 .data(dataForMapArray)
      //                 .enter()
      //                 .append("circle")
      //                 .attr("r",4)
      //                 .attr({
      //                     "cx":function(d){ return projection([d[0], d[1]])[0]},
      //                     "cy":function(d){ return projection([d[0], d[1]])[1]},
      //                     "r": function(d){ return Math.sqrt(circleSizeScale(d[2])/Math.PI);},
      //                     "fill":"grey",
      //                     "opacity":0.6
      //                 }).append("title").text(function(d){
      //                     return d[3] +": "+d[2];
      //                 });
      for (var i = 0; i < dataForMapArray.length; i++) {
        var tempRadius =
          Math.sqrt(circleSizeScale(dataForMapArray[i][2]) / Math.PI) * 1000;
        // console.log(tempRadius);
        var circle = L.circle([dataForMapArray[i][1], dataForMapArray[i][0]], {
          color: "grey",
          fillColor: "grey",
          fillOpacity: 0.6,
          radius: tempRadius,
        }).addTo(mymap);
      }
    } else if (datasetSelection.currentLoadedDatasetIndex == 8) {
      bottomleft = [-122.5136421, 37.71089458];
      topright = [-122.3655654, 37.8096707];
      var projection = d3.geo
        .mercator()
        .center([
          (bottomleft[0] + topright[0]) / 2,
          (bottomleft[1] + topright[1]) / 2,
        ])

        // .scale(width / 2 / Math.PI)
        .scale(100000)
        .translate([width / 2, height / 2])
        .precision(0.1);
      window.mapProjection = projection;
      var path = d3.geo.path().projection(projection);
      // var url = "http://enjalot.github.io/wwsd/data/world/world-110m.geojson";
      var url = "http://bl.ocks.org/datamusing/raw/5732776/SFN.geojson";

      var geojson = JSON.parse(SFNjson2);
      svg
        .append("path")
        .attr("d", path(geojson))
        .style("fill", "#eae5e5")
        .style("stroke", "white");
    } else if (datasetSelection.currentId === "image") {
      d3.select("#highlightedElement").append("div").attr({
        id: "imageDiv",
        width: selectionWidth,
        height: selectionHeight,
        style: "text-align:center",
      });
    }
  }

  function getGroupsForElement(elementId) {
    var groups = [];
    Object.keys(window.selectedGroups).forEach((group) => {
      if (window.selectedGroups[group].indexOf(elementId) >= 0) {
        groups.push(group);
      }
    });
    return groups;
  }

  function createElementList() {
    d3.select("#listExample").selectAll("*").remove();
    var table = d3.select("#listExample");

    var objectIdArray = Object.keys(allObjectsInfo);
    var countA = 0,
      countB = 0,
      countAB = 0;

    var objectArray = []; // AB, A, B, Objectid
    for (var i = 0; i < objectIdArray.length; i++) {
      var d = objectIdArray[i];
      var AB = 0,
        A = 0,
        B = 0;
      var elementGroups = getGroupsForElement(d);
      if (elementGroups.length == 2) {
        AB = 1;
        countAB += 1;
      } else {
        if (elementGroups.indexOf("A") >= 0) {
          A = 1;
          countA += 1;
        }
        if (elementGroups.indexOf("B") >= 0) {
          B = 1;
          countB += 1;
        }
      }
      objectArray.push([AB, A, B, d, allObjectsInfo[d].name]);
    }

    selectionPanel.drawGroupSelectionStats(countAB, countA, countB);
    d3.select("#searchInput").on("input", function (d) {
      var searchText = this.value;
      objectArray = sortObjects(objectArray, searchText);
      drawElementListRows(objectArray);
    });

    objectArray = sortObjects(
      objectArray,
      d3.select("#searchInput").property("value")
    );

    function sortObjects(objectArray, searchText) {
      var stringMatchResults = [];
      window.searchMatchIds = [];
      var unmatched = [];
      for (var i = 0; i < objectArray.length; i++) {
        if (
          searchText != "" &&
          objectArray[i][4].toUpperCase().includes(searchText.toUpperCase())
        ) {
          stringMatchResults.push(objectArray[i]);
          window.searchMatchIds.push(objectArray[i][3]);
        } else unmatched.push(objectArray[i]);
      }
      stringMatchResults.sort(function (a, b) {
        if (a[4] < b[4]) return -1;
        else if (a[4] > b[4]) return 1;
        else return 0;
      });

      unmatched.sort(function (a, b) {
        var primarySort = b[0] - a[0];
        if (primarySort == 0) {
          var secondarySort = b[1] - a[1];
          if (secondarySort == 0) {
            var thirdSort = b[2] - a[2];
            if (thirdSort == 0) {
              if (a[4] < b[4]) return -1;
              else if (a[4] > b[4]) return 1;
              else return 0;
            } else return thirdSort;
          } else return secondarySort;
        } else return primarySort;
      });

      return stringMatchResults.concat(unmatched);
    }

    drawElementListRows(objectArray);

    function drawElementListRows(objectArray) {
      table.selectAll("tr.tablerow").remove();
      var rows = table
        .selectAll("tr.tablerow")
        .data(objectArray)
        .enter()
        .append("tr")
        .attr("class", function (dataitem) {
          var d = dataitem[3];
          var classList = "";
          if (d == window.selectedElement) classList += "tablerow highlighted";
          else classList += "tablerow";

          // if(window.searchMatchIds.indexOf(d)>=0)
          //     classList+= " searchMatch"

          return classList;
        })
        .on("click", function (dataitem) {
          var d = dataitem[3];
          $("#highlightedElement").html("");
          if (!$(this).hasClass("highlighted")) {
            $("#listExample tr").removeClass("highlighted");
            computeAndDrawGroupEdges([d], "0");
            window.selectedElement = [d];
            drawDetails("element", d);
          } else {
            computeAndDrawGroupEdges([], "0");
            window.selectedElement = [];
            d3.select("#selectedEntity").text("");
          }
          $(this).toggleClass("highlighted");
        });
      rows.each(function (dataitem) {
        allObjectsInfo;
        var d = dataitem[3];
        var coloredBarTd = d3
          .select(this)
          .append("td")
          .attr("class", "firstColumn");
        const elementGroups = getGroupsForElement(d);
        if (elementGroups.length == 2) {
          coloredBarTd.append("div").attr({ class: "coloredDivBar groupAB" });
        } else {
          if (elementGroups.indexOf("A") >= 0) {
            coloredBarTd.append("div").attr({ class: "coloredDivBar groupA" });
          }
          if (elementGroups.indexOf("B") >= 0) {
            coloredBarTd.append("div").attr({ class: "coloredDivBar groupB" });
          }
        }
        d3.select(this)
          .append("td")
          .attr("value", d)
          .text(function () {
            if (datasetSelection.currentId === "image") {
              var t = window.allObjectsInfo[d].name;
              var pos = t.lastIndexOf("/") + 1;
              return t.substring(pos).substring(0, 30);
            } else return allObjectsInfo[d].name;
          })
          .append("i")
          .attr("class", function () {
            if (window.searchMatchIds.indexOf(d) >= 0) return "dot";
          });
      });
    }

    d3.selectAll(".coloredDivBar.groupAB").attr("title", "Group A+B");
    d3.selectAll(".coloredDivBar.groupA").attr("title", "Group A");
    d3.selectAll(".coloredDivBar.groupB").attr("title", "Group B");
  }

  String.prototype.replaceAll = function (search, replacement) {
    var target = this;
    return target.split(search).join(replacement);
  };

  function returnArrayOfObjectIdsFromListOfObjects(objectArray) {
    var objectIdArray = [];
    for (var i = 0; i < objectArray.length; i++) {
      objectIdArray.push(objectArray[i].objectid);
    }
    return objectIdArray;
  }

  function updateSelectedGroupEdges() {
    groupA = window.selectedGroups["A"] ? window.selectedGroups["A"] : [];
    groupB = window.selectedGroups["B"] ? window.selectedGroups["B"] : [];
    groupAB = intersection(groupA, groupB);
    computeAndDrawGroupEdges(groupA, "A");
    computeAndDrawGroupEdges(groupB, "B");
    computeAndDrawGroupEdges(groupAB, "AB");
  }

  function computeAndDrawGroupEdges(objectIds, group) {
    var groupId = "group" + group;
    d3.selectAll(`#mainVisualization .${groupId}`).remove();
    var selectedGroupEdges = calculateEdges(objectIds);
    selectedGroupEdges = computePositionsOfEdgesForSelectedGroup(
      selectedGroupEdges,
      groupId
    );
    drawEdges(selectedGroupEdges, groupId);

    var selectedInteractionEdges = calculateSelectedInteractionEdges(
      objectIds,
      groupId
    );
    if (
      selectedInteractionEdges.normal.length > 0 ||
      selectedInteractionEdges.selfLoop.length > 0
    ) {
      // console.log(selectedInteractionEdges);
      drawInteractionEdges(
        selectedInteractionEdges.normal,
        selectedInteractionEdges.selfLoop
      );
    }
  }

  function edgeGroupSelected(objects, from, to, edgeid) {
    var objectIds = [];

    for (var i = 0; i < objects.length; i++) {
      objectIds.push(objects[i].objectid);
    }

    computeAndDrawGroupEdges(objectIds);
  }

  function nodeGroupSelected(objects, timestep, nodeId) {
    edgeGroupSelected(objects, "a", "b", "e");
  }

  function aggregatedIntersections(degree, timestep) {
    let aggregatedSetElements = [];
    const timestepIndex = timeLabelToIndexDictionary[timestep];
    for (var conceptId in window.inputRawData[timestepIndex]) {
      var concept = window.inputRawData[timestepIndex][conceptId];
      if (degree == concept.degree) {
        let tempobjectIdArray = [];
        for (var i = 0; i < concept.exclusive.length; i++)
          tempobjectIdArray.push(concept.exclusive[i].objectid);
        aggregatedSetElements = union(aggregatedSetElements, tempobjectIdArray);
      }
    }

    return aggregatedSetElements;
  }

  function unionSetList(sets, timestep) {
    let aggregatedSetElements = [];
    sets.forEach((setName) => {
      aggregatedSetElements = union(
        aggregatedSetElements,
        getSetElements(setName, timestep)
      );
    });
    return aggregatedSetElements;
  }

  function intersectionSetList(sets, timestep) {
    let aggregatedSetElements = getSetElements(sets[0], timestep);
    sets.slice(1, sets.length).forEach((setName) => {
      aggregatedSetElements = intersection(
        aggregatedSetElements,
        getSetElements(setName, timestep)
      );
    });
    return aggregatedSetElements;
  }

  function intersection(oListA, oListB) {
    var resultArray = [];
    for (var i = 0; i < oListA.length; i++) {
      if (oListB.indexOf(oListA[i]) >= 0) resultArray.push(oListA[i]);
    }
    return resultArray;
  }

  function union(oListA, oListB) {
    var resultArray = [];
    for (var i = 0; i < oListA.length; i++) {
      if (oListB.indexOf(oListA[i]) < 0) resultArray.push(oListA[i]);
    }
    for (var i = 0; i < oListB.length; i++) {
      resultArray.push(oListB[i]);
    }
    return resultArray;
  }

  function minus(oListA, oListB) {
    var resultArray = [];
    for (var i = 0; i < oListA.length; i++) {
      if (oListB.indexOf(oListA[i]) < 0) resultArray.push(oListA[i]);
    }
    return resultArray;
  }

  function drawEdges(edges, group) {
    var edgeGroup = graphGroup.append("g");
    edgeGroup
      .selectAll("path")
      .data(edges)
      .enter()
      .append("path")
      // .classed("edge",true)
      .attr("id", function (d) {
        return d.id;
      })
      .attr("class", function (d) {
        return d.class;
      })
      .attr({
        cursor: "pointer",
        d: function (d) {
          if (d.type == undefined || d.type == "consecutive")
            return (
              "M " +
              d.x1 +
              " " +
              d.y1 +
              " C " +
              d.p1x +
              " " +
              d.p1y +
              ", " +
              d.p2x +
              " " +
              d.p2y +
              ", " +
              d.x2 +
              " " +
              d.y2
            );
          else if (d.type == "nonconsecutive") {
            var dis = 10;
            var tempDis = 10;
            var p1beforex = d.p1x - dis;
            var p1afterx = d.p1x + dis;
            var p1beforey = d.p1y + dis;
            var p1aftery = d.p1y;

            var p2beforex = d.p2x - dis;
            var p2beforey = d.p2y;
            var p2afterx = d.p2x + dis;
            var p2aftery = d.p2y + dis;
            // return "M "+d.x1+" "+d.y1+" L "+d.p1x+" "+d.p1y + ", L "+d.p2x+" "+d.p2y+", L "+d.x2+" "+d.y2;
            return (
              "M " +
              d.x1 +
              " " +
              d.y1 +
              "Q " +
              (d.x1 + tempDis) +
              " " +
              d.y1 +
              " " +
              p1beforex +
              " " +
              p1beforey +
              ", Q " +
              d.p1x +
              " " +
              d.p1y +
              " " +
              p1afterx +
              " " +
              p1aftery +
              ", L " +
              p2beforex +
              " " +
              p2beforey +
              ", Q " +
              d.p2x +
              " " +
              d.p2y +
              " " +
              p2afterx +
              " " +
              p2aftery +
              "Q " +
              (d.x2 - dis) +
              " " +
              d.y2 +
              " " +
              d.x2 +
              " " +
              d.y2
            );
          }
        },
      })
      .attr("stroke-width", function (d) {
        return edgeThicknessScale(d.objects.length);
      })
      .on("mouseenter", function (d) {
        // d3.select(this).attr("opacity", 1.0);
        var coordinates = d3.mouse(this);
        var x = coordinates[0];
        var y = coordinates[1];
        highlightRectsBasedOnPosition(x, y);
        // elementNamesOnMouseOver(d.objects, [d.x1, d.y1]);
        elementNamesOnMouseOver(d.objects, [x, y]);
      })
      .on("mouseout", function () {
        d3.selectAll(".highlightRectCol").attr("fill", "white");
        d3.selectAll(".highlightRect").attr("fill", "white");
        d3.select("#elementNamesOnMouseOverGroup").remove();
      })
      .on("click", function (d) {
        // console.log(d);

        var fromType = "",
          totype = "";
        var from = "",
          to = "";
        var fromTimestep, toTimestep;
        if (d.from.charAt(2) == "N" && !d.from.includes("added")) {
          fromType = "exclusive intersection of ";
          interString = window.sethashandNameDict[window.nodes[d.from].setid];
          mofifiedString = parseSetNames(interString);
          from = "[" + mofifiedString + "]";
        } else if (d.from.charAt(2) == "D") {
          fromType = " ";
          from = "exclusive" + d.from.charAt(3) + "-set intersections ";
        }

        if (d.to.charAt(2) == "N" && !d.to.includes("removed")) {
          totype = "exclusive intersection of ";
          interString = window.sethashandNameDict[window.nodes[d.to].setid];
          mofifiedString = parseSetNames(interString);
          to = "[" + mofifiedString + "]";
        } else if (d.to.charAt(2) == "D") {
          totype = " ";
          to = "exclusive" + d.to.charAt(3) + "-set intersections ";
        }

        function parseSetNames(interString) {
          var tempArray = interString.split(",");
          var returnString = "";
          if (tempArray.length > 1) {
            for (var i = 0; i < tempArray.length; i++) {
              if (tempArray[i] != "" && tempArray[i] != ",") {
                if (i > 0) returnString += "," + tempArray[i];
                else returnString += tempArray[i];
              }
            }
          } else {
            returnString = interString;
          }

          return returnString;
        }

        fromTimestep = window.filenames[parseInt(d.from.charAt(1))];
        toTimestep = window.filenames[parseInt(d.to.charAt(1))];
        var text =
          "Elements moving from " +
          fromType +
          from +
          " in " +
          fromTimestep +
          " to " +
          totype +
          to +
          " in " +
          toTimestep;

        if (d.from.includes("added")) {
          text = "Elements added to " + totype + to + " in " + toTimestep;
        } else if (d.to.includes("removed")) {
          text =
            "Elements removed from " +
            fromType +
            from +
            " after " +
            fromTimestep;
        } else if (from == to) {
          text =
            "Elements that remained in " +
            fromType +
            from +
            " between timesteps " +
            fromTimestep +
            " and " +
            toTimestep;
        }

        if ($(`#radioSelection`).prop("checked")) {
          drawDetails("edge", d.objects, -1, [d.fromTimestep, d.toTimestep]);
        } else selectionPanel.selectEdge(text, d.objects);
      })
      .append("title")
      .text(function (d) {
        var wt = d.objects.length;
        if (wt == 1) return wt + " element";
        else return wt + " elements";
      });
  }

  function elementNamesOnMouseOver(objectIdDictArray, pos) {
    d3.select("#elementNamesOnMouseOverGroup").remove();
    var objectIdArray = [];
    for (var ob of objectIdDictArray) objectIdArray.push(ob.objectid);

    var g = graphGroup.append("g").attr("id", "elementNamesOnMouseOverGroup");
    var breakCount = guiParams.numOfRowsonMouseOver;
    g.append("rect").attr({
      x: pos[0] - 200,
      y: pos[1] - guiParams.fontSize,
      width: 200 - 15,
      height: (breakCount + 1) * (guiParams.fontSize + 1),
      fill: "white",
      opacity: 0.7,
    });
    var textOverfillFlag = false;
    for (var i = 0; i < objectIdArray.length; i++) {
      if (textOverfillFlag == false) {
        var elementString = "";
        if (i < breakCount) {
          elementString =
            i + 1 + ". " + window.allObjectsInfo[objectIdArray[i]].name;
        } else {
          elementString = "...[" + (objectIdArray.length - i) + " more]";
          textOverfillFlag = true;
        }
        g.append("text")
          .text(elementString)
          .attr({
            x: pos[0] - 20,
            y: pos[1] + (i * guiParams.fontSize + 1),
            "font-size": guiParams.fontSize,
            "dominant-baseline": "middle",
            "text-anchor": "end",
          });
      } else break;
    }
  }

  function lengthOfInteractionEdge(edge) {
    var posIndex = [];
    edge.nodes.forEach((conceptId) => {
      posIndex.push(guiParams.verticalPosition[conceptId]);
    });
    return d3.max(posIndex) - d3.min(posIndex);
  }
  function minPosOfEdge(edge) {
    var posIndex = [];
    edge.nodes.forEach((conceptId) => {
      posIndex.push(guiParams.verticalPosition[conceptId]);
    });
    return d3.min(posIndex);
  }

  function selectInteractionEdge(edgeId) {
    d3.select("#" + edgeId).attr("stroke", "#ec6502");
    d3.select("#" + edgeId).attr("opacity", 1);
    document.getElementById(edgeId).classList.add("selectedInteractionEdge");
  }

  function deSelectInteractionEdge(edgeId) {
    document.getElementById(edgeId).classList.remove("selectedInteractionEdge");
  }

  function highlightInteractionEdge(conceptId) {
    // d3.selectAll(".interactionEdges").attr("opacity",0.1);
    d3.selectAll(".I" + conceptId + ":not(.selectedInteractionEdge)").attr(
      "stroke",
      "black"
    );
    d3.selectAll(".I" + conceptId + ":not(.selectedInteractionEdge)").attr(
      "opacity",
      1
    );
    d3.selectAll(".C" + conceptId).attr("opacity", 1);
    d3.selectAll(".C" + conceptId).attr("stroke", "black");
    // d3.selectAll(".I"+conceptId).attr("stroke","black");
  }

  function deHighlightInteractionEdges() {
    d3.selectAll(".interactionEdges:not(.selectedInteractionEdge)").attr(
      "opacity",
      guiParams.interactionEdgeOpacity
    );
    d3.selectAll(".interactionEdgesCircles").attr(
      "opacity",
      guiParams.interactionEdgeOpacity
    );
    d3.selectAll(".interactionEdges:not(.selectedInteractionEdge)").attr(
      "stroke",
      "grey"
    );
  }

  function computeUniqueElements(edge) {
    var uniqueElementDict = {};
    for (var elementArray of edge["authors"]) {
      for (var element of elementArray) {
        if (element in uniqueElementDict) uniqueElementDict[element]++;
        else uniqueElementDict[element] = 1;
      }
    }
    return uniqueElementDict;
  }

  function drawInteractionEdges(edges, selfLoop) {
    var edgeGroup2 = graphGroup.append("g");
    var countDict = getMaxCountOfInteractionEdges(
      interactionEdges_MergedGrouped
    );
    window.interactionEdgeThicknessScale = d3.scale
      .linear()
      .domain([
        1,
        // d3.min([countDict["minCount"], countDict["minCountLoop"]]),
        // d3.max([countDict["maxCount"], countDict["maxCountLoop"]])
        countDict["maxCount"],
      ])
      .range([1, 2 * guiParams.hyperEdgeCircleRadius]);
    if (window.currentDatasetId == "tech")
      window.interactionEdgeThicknessScale = edgeThicknessScale;

    var singleEdgeGroup = edgeGroup2
      .selectAll("g")
      .data(edges)
      .enter()
      .append("g");
    singleEdgeGroup
      .attr({
        class: function (e) {
          return e.class;
        },
        id: function (e) {
          return e.edgeId;
        },
        cursor: "pointer",
      })
      .on("click", function (d) {
        var text =
          "Elements who interacted across the exclusive intersections of ";
        var setNames = "";
        var nodeArray = Array.from(d.nodes);
        for (var i = 0; i < nodeArray.length; i++) {
          if (i == 1 && i == nodeArray.length - 1) setNames += " and";
          else if (i > 1 && i == nodeArray.length - 1) setNames += ", and";
          else if (i > 0 && i != nodeArray.length - 1) setNames += ",";

          var tempIntersectionNameString =
            window.sethashandNameDict[nodeArray[i]];
          if (
            tempIntersectionNameString.charAt(
              tempIntersectionNameString.length - 1
            ) == ","
          )
            tempIntersectionNameString = tempIntersectionNameString.substring(
              0,
              tempIntersectionNameString.length - 1
            );
          tempIntersectionNameString = tempIntersectionNameString.replaceAll(
            ",",
            ", "
          );
          setNames += " [" + tempIntersectionNameString + "]";
        }

        text += setNames;
        text += " in the timestep " + window.filenames[d.timestep];
        var objectsArray = [];
        for (var obj in d.uniqueElements) {
          objectsArray.push({
            objectid: window.allObjectsInfo_Reverse[obj],
            weight: d.uniqueElements[obj],
          });
        }
        if ($(`#radioSelection`).prop("checked")) {
          drawDetails("interaction", d);
        } else {
          selectionPanel.selectEdge(text, objectsArray);
        }
      })
      .on("mouseenter", function (d) {
        var coordinates = d3.mouse(this);
        var x = coordinates[0];
        var y = coordinates[1];

        highlightRectsBasedOnPosition(x, y);
        interactionEdgeMouseEnter(d, "normal");
      })
      .on("mouseout", function (d) {
        d3.selectAll(".highlightRectCol").attr("fill", "white");
        d3.selectAll(".highlightRect").attr("fill", "white");
        d3.select("#interactionEdgeMouseOver").remove();
      })
      .append("title")
      .text(function (e) {
        return (
          e.count +
          " inter-group interactions; " +
          e.numUniqueElements +
          " unique elements"
        );
      });
    function interactionEdgeMouseEnter(d, edgeType) {
      d3.select("#interactionEdgeMouseOver").remove();
      var g = graphGroup.append("g").attr("id", "interactionEdgeMouseOver");
      var breakCount = guiParams.numOfRowsonMouseOver;
      if (edgeType == "normal") {
        var disArray = [];
        for (var i = 0; i < d.circlePositions.length - 1; i++) {
          disArray.push(
            Math.abs(d.circlePositions[i + 1][1] - d.circlePositions[i][1])
          );
        }
        var minDistance = d3.min(disArray);
        var breakCount = Math.floor(minDistance / (guiParams.fontSize + 1));
        if (breakCount > 2) breakCount = breakCount - 2;
      }

      var transparentRectWidth = 400;
      if (window.currentDatasetId == "tech") transparentRectWidth = 140;

      for (var conceptId in d.nodePositionDict) {
        var pos = d.nodePositionDict[conceptId];
        var xPos = pos[0] - transparentRectWidth;
        if (xPos < 0) xPos = pos[0] + window.widthOfNode;
        var numRows = breakCount;
        var tempNumRows = 0;
        for (var interaction of d.nodesElementDictionaryArray) {
          if (conceptId in interaction) tempNumRows++;
        }
        if (tempNumRows < breakCount) numRows = tempNumRows;
        g.append("rect").attr({
          x: xPos,
          y: pos[1] - guiParams.fontSize,
          width: transparentRectWidth - 15,
          height: (numRows + 1) * (guiParams.fontSize + 1),
          fill: "white",
          opacity: 0.6,
        });
      }
      var textOverfillFlag = false;
      for (var x = 0; x < d.nodesElementDictionaryArray.length; x++) {
        if (textOverfillFlag == false) {
          var edge = d.nodesElementDictionaryArray[x];
          for (var conceptId in edge) {
            var elementArray = edge[conceptId];
            var elementString = "";
            var pos = d.nodePositionDict[conceptId];
            var xPos = pos[0] - transparentRectWidth;
            var outOfScreenFlag = false;
            if (xPos < 0) {
              xPos = pos[0] + window.widthOfNode + 10;
              outOfScreenFlag = true;
            } else xPos = pos[0] - 20;
            if (x < breakCount) {
              elementString = "" + (x + 1) + ": ";
              for (var y = 0; y < elementArray.length; y++) {
                elementString += elementArray[y];
                if (y < elementArray.length - 1) elementString += ", ";
              }
            } else {
              elementString =
                "...[" + (d.nodesElementDictionaryArray.length - x) + " more]";
              textOverfillFlag = true;
              // break;
            }

            g.append("text")
              .text(elementString)
              .attr({
                x: xPos,
                y: pos[1] + (x * guiParams.fontSize + 1),
                "font-size": guiParams.fontSize,
                "dominant-baseline": "middle",
                "text-anchor": function () {
                  if (outOfScreenFlag) return "start";
                  else return "end";
                },
              });
          }
        } else break;
      }
    }

    singleEdgeGroup.append("line").attr({
      x1: function (e) {
        return e.x1;
      },
      y1: function (e) {
        return e.y1;
      },
      x2: function (e) {
        return e.x2;
      },
      y2: function (e) {
        return e.y2;
      },
      edgeId: function (e) {
        return e.edgeId;
      },
      "stroke-opacity": function (e) {
        if (e.class.includes("group0")) {
          return 0.9;
        } else return guiParams.interactionEdgeOpacity;
      },
      "stroke-width": function (e) {
        if (e.class.includes("group0")) {
          return "5px";
        } else return interactionEdgeThicknessScale(e.count);
      },
    });
    singleEdgeGroup.append("line").attr({
      x1: function (e) {
        return e.x1;
      },
      y1: function (e) {
        return e.y1;
      },
      x2: function (e) {
        return e.x2;
      },
      y2: function (e) {
        return e.y2;
      },
      stroke: "transparent",
      cursor: "pointer",
      "stroke-width": 2 * guiParams.hyperEdgeCircleRadius,
    });
    singleEdgeGroup
      .selectAll("circle")
      .data(function (e) {
        return e.circlePositions;
      })
      .enter()
      .append("circle")
      .attr({
        r: guiParams.hyperEdgeCircleRadius,
        cx: function (d) {
          return d[0];
        },
        cy: function (d) {
          return d[1];
        },
        fill: function (e) {
          if (d3.select(this.parentNode).attr("class").includes("group0"))
            return "black";
          else return "white";
        },
        stroke: "black",
        // "edgeId": function(d){return d[0];},
        // "cursor":"pointer",
        // "class":"interactionEdgesCircles "+e.edgeId +" C"+conceptId
      });
    var selfLoopEdgeGroup = graphGroup.append("g");
    var group = selfLoopEdgeGroup
      .selectAll("g")
      .data(selfLoop)
      .enter()
      .append("g")
      .attr("class", function (e) {
        return e.class;
      })
      .attr("id", function (e) {
        return e.edgeId;
      })
      .on("mouseenter", function (d) {
        // var coordinates= d3.mouse(this);
        // var x = coordinates[0];
        // var y = coordinates[1];

        // highlightRectsBasedOnPosition(x,y);
        d.nodes.forEach((rowId) => {
          highlightRects(d3.select("#RowId" + rowId));
        });

        interactionEdgeMouseEnter(d, "selfLoop");
      })
      .on("mouseout", function (d) {
        d3.selectAll(".highlightRectCol").attr("fill", "white");
        d3.selectAll(".highlightRect").attr("fill", "white");
        d3.select("#interactionEdgeMouseOver").remove();
      });

    group.append("rect").attr({
      x: function (e) {
        return e.x;
      },
      y: function (e) {
        return e.y;
      },
      width: function (e) {
        if (e.class.includes("group0")) return "5px";
        // return e.width;
        else return interactionEdgeThicknessScale(e.count);
      },
      height: function (e) {
        return e.height;
      },
      transform: function (e) {
        return `translate(${e.x} ${e.y}) skewX(-45) translate(${-e.x} ${-e.y})`;
      },
      "fill-opacity": guiParams.interactionEdgeOpacity,
      fill: "grey",
      cursor: "pointer",
      // "fill":"grey",
      // "class": function(e){ return e.class; }
    });
    group.append("rect").attr({
      x: function (e) {
        return e.x;
      },
      y: function (e) {
        return e.y;
      },
      width: 3 * guiParams.hyperEdgeCircleRadius,
      height: function (e) {
        return e.height;
      },
      transform: function (e) {
        return `translate(${e.x} ${e.y}) skewX(-45) translate(${-e.x} ${-e.y})`;
      },
      // "fill-opacity": guiParams.interactionEdgeOpacity,
      stroke: "none",
      cursor: "pointer",
      fill: "transparent",
      // "opacity":0.6,
    });
    group
      .on("click", function (d) {
        var text =
          "Elements who interacted within the exclusive intersection of ";
        var setNames = "";
        var nodeArray = Array.from(d.nodes);
        for (var i = 0; i < nodeArray.length; i++) {
          if (i == 1 && i == nodeArray.length - 1) setNames += " and";
          else if (i > 1 && i == nodeArray.length - 1) setNames += ", and";
          else if (i > 0 && i != nodeArray.length - 1) setNames += ",";

          var tempIntersectionNameString =
            window.sethashandNameDict[nodeArray[i]];
          if (
            tempIntersectionNameString.charAt(
              tempIntersectionNameString.length - 1
            ) == ","
          )
            tempIntersectionNameString = tempIntersectionNameString.substring(
              0,
              tempIntersectionNameString.length - 1
            );
          tempIntersectionNameString = tempIntersectionNameString.replaceAll(
            ",",
            ", "
          );
          setNames += " [" + tempIntersectionNameString + "]";
        }
        text += setNames;
        text += " in the timestep " + window.filenames[d.timestep];

        var objectsArray = [];
        for (var obj in d.uniqueElements) {
          objectsArray.push({
            objectid: window.allObjectsInfo_Reverse[obj],
            weight: d.uniqueElements[obj],
          });
        }
        if ($(`#radioSelection`).prop("checked")) {
          drawDetails("interaction", d);
        } else selectionPanel.selectEdge(text, objectsArray);
      })
      .append("title")
      .text(function (e) {
        return (
          e.count +
          " intra-group interactions; " +
          e.numUniqueElements +
          " unique elements"
        );
      });

    deHighlightInteractionEdges();
  }

  function drawDetails(type, selection, timestep, timestepArray, nodeid) {
    var detailsDiv = d3.select("#highlightedElement");
    detailsDiv.selectAll("*").remove();
    var list = detailsDiv.append("ol").attr("type", "1");

    var selectionString = "Selected";
    d3.select("#selectedEntity").text("");

    if (type == "interaction") {
      computeAndDrawGroupEdges([], "0");
      window.selectedElement = [];
      $("#listExample tr").removeClass("highlighted");
      if (window.currentDatasetId == "tech") {
        for (var i = 0; i < selection.title.length; i++) {
          var li = list.append("li").text(selection.title[i]);
          li.append("a").attr("href", selection.link[i]).text(" [Info]");
        }
      }
      if (window.currentDatasetId == "csresearch") {
        for (var i = 0; i < selection.nodesElementDictionaryArray.length; i++) {
          var e = selection.nodesElementDictionaryArray[i];
          var elementArray = [];
          for (var conceptId in e) {
            elementArray = elementArray.concat(e[conceptId]);
          }
          var li = list.append("li").text("[" + elementArray.join(", ") + "]");
          list.append("p").text("- " + selection.title[i]);
        }
      }

      var tmparray = [];
      selection.nodes.forEach((conceptId) => {
        var tString = window.sethashandNameDict[conceptId];
        var tArray = tString.split(",");
        if (tArray[tArray.length - 1] == "") tArray.pop();
        tmparray.push(tArray.join(", "));

        // if(tmparray.length ==1) selectionString += "[" + tmparray[0] +"]"
      });
      if (tmparray.length == 1)
        selectionString += " interactions within exclusive intersection of ";
      else selectionString += " interactions between exclusive intersections ";
      selectionString += "[" + tmparray[0] + "]";
      for (var xx = 1; xx < tmparray.length; xx++) {
        if (tmparray.length == 2) {
          if (xx == 1) selectionString += " and ";
        } else if (tmparray.length > 2) {
          if (xx == tmparray.length - 1) selectionString += ", and ";
          else selectionString += ", ";
        }
        selectionString += "[" + tmparray[xx] + "]";
      }

      selectionString += " at timestep " + window.filenames[selection.timestep];
    } else if (type == "node") {
      computeAndDrawGroupEdges([], "0");
      window.selectedElement = [];
      $("#listExample tr").removeClass("highlighted");
      // var objectIdArray = [];
      for (var ob of selection) {
        // objectIdArray.push(ob.objectid)
        var obName = window.allObjectsInfo[ob.objectid].name;
        var li = list.append("li").text(obName);
        if (window.currentDatasetId == "tech") {
          var timestepInfo =
            window.techCompaniesRawJSON.memberships[window.filenames[timestep]];
          if (obName in timestepInfo) {
            var details = timestepInfo[obName].details;
            if (details != "") li.append("p").append("text").text(details);
          }
        }
      }
      selectionString += " node ";
      var tString = window.sethashandNameDict[nodeid];
      var tArray = tString.split(",");
      if (tArray[tArray.length - 1] == "") tArray.pop();
      selectionString += "[" + tArray.join(", ") + "]";
      selectionString += " at timestep " + window.filenames[timestep];
    } else if (type == "edge") {
      computeAndDrawGroupEdges([], "0");
      window.selectedElement = [];
      $("#listExample tr").removeClass("highlighted");
      // var objectIdArray = [];
      for (var ob of selection) {
        // objectIdArray.push(ob.objectid)
        var obName = window.allObjectsInfo[ob.objectid].name;
        var li = list.append("li").text(obName);
        if (window.currentDatasetId == "tech") {
          var detail1 =
            window.techCompaniesRawJSON.memberships[
              window.filenames[timestepArray[0]]
            ][obName].details;
          var detail2 =
            window.techCompaniesRawJSON.memberships[
              window.filenames[timestepArray[1]]
            ][obName].details;
          if (timestepArray[0] == timestepArray[1]) {
            // li.append("text").text(": "+detail1);
            li.append("p")
              .append("text")
              .text(window.filenames[timestepArray[0]] + ": " + detail1);
          } else {
            if (detail1 != "")
              li.append("p")
                .append("text")
                .text(window.filenames[timestepArray[0]] + ": " + detail1);
            if (detail2 != "")
              li.append("p")
                .append("text")
                .text(window.filenames[timestepArray[1]] + ": " + detail2);
          }
        }
      }
      selectionString +=
        " edge between timesteps " +
        window.filenames[timestepArray[0]] +
        " and " +
        window.filenames[timestepArray[1]];
    } else if (type == "element") {
      var obName = window.allObjectsInfo[selection].name;
      var li = list.append("li").text(obName);
      if (window.currentDatasetId == "tech") {
        for (var timestepString of window.filenames) {
          var timestepInfo =
            window.techCompaniesRawJSON.memberships[timestepString];
          if (obName in timestepInfo) {
            var details = timestepInfo[obName].details;
            if (details != "")
              li.append("p")
                .append("text")
                .text("- " + details);
          }
        }
      }
      selectionString += " element " + obName;
    }
    d3.select("#selectedEntity").text(" – " + selectionString);
  }

  function getMaxCountOfInteractionEdges(interactionEdges_MergedGrouped) {
    var minCount = 99999;
    var maxCount = -1;
    var minCountLoop = 9999;
    var maxCountLoop = -1;
    for (var time in interactionEdges_MergedGrouped) {
      for (var e of interactionEdges_MergedGrouped[time]) {
        if (e.nodes.size > 1) {
          minCount = d3.min([minCount, e.count]);
          maxCount = d3.max([maxCount, e.count]);
        } else if (e.nodes.size == 1) {
          minCountLoop = d3.min([minCountLoop, e.count]);
          maxCountLoop = d3.max([maxCountLoop, e.count]);
        }
      }
    }
    return {
      minCount: minCount,
      maxCount: maxCount,
      minCountLoop: minCountLoop,
      maxCountLoop: maxCountLoop,
    };
  }

  function highlightRectsBasedOnPosition(x, y) {
    for (var i = 0; i < window.highlightRectPositions.length; i++) {
      var tmp = window.highlightRectPositions[i];
      if (y >= tmp[0] && y <= tmp[0] + tmp[1]) {
        highlightRects(d3.select("#" + tmp[2]));
        break;
      }
    }
  }

  function calculateEdges(objectIdsArray) {
    var tempedges = [];
    for (var i = 0; i < inputRawData.length - 1; i++) {
      var nodesArray = Object.keys(inputRawData[i]);

      for (var j = 0; j < nodesArray.length; j++) {
        if (nodesArray[j] != "added" && nodesArray[j] != "removed") {
          var tempobjects = copy(inputRawData[i][nodesArray[j]].exclusive);
          var objectsInSelectedGroup = [];
          for (var k = 0; k < tempobjects.length; k++) {
            if (
              objectIdsArray != undefined &&
              objectIdsArray.indexOf(tempobjects[k].objectid) >= 0
            )
              objectsInSelectedGroup.push(tempobjects[k]);
          }
          for (var k = 0; k < objectsInSelectedGroup.length; k++) {
            var nextPresenceOfObject = findNextPresenceOfObjectQuery(
              objectsInSelectedGroup[k],
              i
            );
            var currentNodeId = "T" + i + "N" + nodesArray[j];
            var deg = inputRawData[i][nodesArray[j]].degree;
            if (window.degreesAggregated[deg] == 1)
              currentNodeId = "T" + i + "D" + deg;

            if (nextPresenceOfObject == 0) {
              tempedges.push({
                from: currentNodeId,
                to: "T" + i + "N" + "removed",
                objects: [objectsInSelectedGroup[k]],
              });
            } else {
              tempedges.push({
                from: currentNodeId,
                to: nextPresenceOfObject,
                objects: [objectsInSelectedGroup[k]],
              });
            }

            var previousPresenceOfObject = findPreviousPresenceOfObjectQuery(
              objectsInSelectedGroup[k],
              i
            );
            if (previousPresenceOfObject == 0 && i > 0) {
              tempedges.push({
                from: "T" + i + "N" + "added",
                to: currentNodeId,
                objects: [objectsInSelectedGroup[k]],
              });
            }
          }
        }
      }
    }

    // Merge edges with same source and destination

    for (var i = 0; i < tempedges.length; i++) {
      for (var j = 0; j < tempedges.length; ) {
        if (
          i != j &&
          tempedges[i].from === tempedges[j].from &&
          tempedges[i].to === tempedges[j].to
        ) {
          tempedges[i].objects = tempedges[i].objects.concat(
            tempedges[j].objects
          );
          tempedges.splice(j, 1);
        } else j++;
      }
    }
    for (var i = 0; i < tempedges.length; i++) {
      tempedges[i]["id"] = "e" + edgeIdCounter;
      edgeIdCounter++;
    }

    return tempedges;
  }

  function calculateSelectedInteractionEdges(objectIdsArray, groupId) {
    var tempInteractionEdges = [];
    var tempInteractionEdgesSelfLoop = [];

    if (objectIdsArray != undefined && objectIdsArray.length > 0) {
      tempInteractionEdges = commonComputationOfInteractionEdges(
        objectIdsArray,
        window.interactionEdges,
        groupId
      );
      tempInteractionEdgesSelfLoop = commonComputationOfInteractionEdges(
        objectIdsArray,
        window.interactionEdgesSelfLoop,
        groupId
      );
    }
    return {
      normal: tempInteractionEdges,
      selfLoop: tempInteractionEdgesSelfLoop,
    };
  }

  function commonComputationOfInteractionEdges(
    objectIdsArray,
    iEdges,
    groupId
  ) {
    var tempInteractionEdges = [];
    var setOfObjectNames = new Set();
    for (var objId of objectIdsArray) {
      setOfObjectNames.add(window.allObjectsInfo[objId]["name"]);
    }

    for (var e of iEdges) {
      var tempEdge = -1;
      for (var objectArray of e.authors) {
        var tempSetofObjectsInInteraction = new Set(objectArray);
        const intersection = new Set(
          [...tempSetofObjectsInInteraction].filter((x) =>
            setOfObjectNames.has(x)
          )
        );
        if (intersection.size > 0) {
          if (tempEdge == -1) {
            tempEdge = copy(e);
            tempEdge.authors = [objectArray];
          } else {
            tempEdge.authors.push(objectArray);
          }
        }
      }

      if (tempEdge != -1) {
        tempEdge.count = tempEdge.authors.length;
        tempEdge.nodes = new Set(e.nodes);
        var uniqueElements = computeUniqueElements(tempEdge);
        tempEdge.numUniqueElements = Object.keys(uniqueElements).length;
        tempEdge.uniqueElements = uniqueElements;
        tempEdge.class += " " + groupId;
        if (tempEdge.nodes.size == 1) {
          tempEdge.width = edgeThicknessScale(tempEdge.count);
        }

        tempInteractionEdges.push(tempEdge);
      }
    }
    return tempInteractionEdges;
  }

  function computePositionsOfEdgesForSelectedGroup(selectedEdges, groupid) {
    for (var i = 0; i < selectedEdges.length; i++) {
      for (var j = 0; j < window.edges.length; j++) {
        if (
          selectedEdges[i].from == window.edges[j].from &&
          selectedEdges[i].to == window.edges[j].to
        ) {
          var classOfEdge = groupid + " " + window.edges[j].class;
          selectedEdges[i]["x1"] = window.edges[j].x1;
          selectedEdges[i]["y1"] = window.edges[j].y1;
          selectedEdges[i]["x2"] = window.edges[j].x2;
          selectedEdges[i]["y2"] = window.edges[j].y2;
          selectedEdges[i]["p1x"] = window.edges[j].p1x;
          selectedEdges[i]["p1y"] = window.edges[j].p1y;
          selectedEdges[i]["p2x"] = window.edges[j].p2x;
          selectedEdges[i]["p2y"] = window.edges[j].p2y;
          selectedEdges[i]["class"] = classOfEdge;
          selectedEdges[i]["type"] = window.edges[j].type;
        }
      }
    }
    return selectedEdges;
  }

  function findY2Weight(destinationNode, direction, edgeid, group) {
    var y2 = 0;
    var inedges = "";
    if (group === undefined) inedges = "inedges";
    else inedges = "inedges" + group;

    var temparray;
    // if(direction == "comingdown")
    // {

    temparray = destinationNode.inedges.comingdown;
    var tempweight = 0;
    for (var i = 0; i < temparray.length; i++) {
      if (temparray[i].id != edgeid) {
        tempweight += temparray[i].objects.length;
      } else {
        return tempweight;
      }
    }

    // }
    // else if (direction == "same")
    // {
    temparray = destinationNode.inedges.same;
    for (var i = 0; i < temparray.length; i++) {
      if (temparray[i].id != edgeid) {
        tempweight += temparray[i].objects.length;
      } else {
        return tempweight;
      }
    }

    temparray = destinationNode.inedges.comingup;
    for (var i = 0; i < temparray.length; i++) {
      if (temparray[i].id != edgeid) {
        tempweight += temparray[i].objects.length;
      } else {
        return tempweight;
      }
    }

    // }
    // else if(direction == "comingup")
    // {

    // }
  }

  function reorderEdges(edges) {
    window.edgeDirectionDictionary = {};
    for (var i = 0; i < edges.length; i++) {
      var fromNodeHash = edges[i].from;
      var toNodeHash = edges[i].to;
      if (!(fromNodeHash in edgeDirectionDictionary)) {
        edgeDirectionDictionary[fromNodeHash] = { up: [], same: [], down: [] };
      }

      if (fromNodeHash.slice(3) === toNodeHash.slice(3))
        edgeDirectionDictionary[fromNodeHash].same.push(edges[i]);
      else if (nodes[fromNodeHash].y > nodes[toNodeHash].y) {
        edgeDirectionDictionary[fromNodeHash].up.push(edges[i]);
        // console.log(nodes[fromNodeHash].y, nodes[toNodeHash].y);
      } else edgeDirectionDictionary[fromNodeHash].down.push(edges[i]);
    }

    var sortedEdges = [];
    for (var nodeobj in edgeDirectionDictionary) {
      // for(var dir in edgeDirectionDictionary[nodeobj])
      // {
      var temp = sortEdgeBasedOnDestinationYLocation(
        edgeDirectionDictionary[nodeobj]["up"],
        "up"
      );
      for (var i = 0; i < temp.length; i++) sortedEdges.push(temp[i]);

      temp = sortEdgeBasedOnDestinationYLocation(
        edgeDirectionDictionary[nodeobj]["same"],
        "same"
      );
      for (var i = 0; i < temp.length; i++) sortedEdges.push(temp[i]);

      temp = sortEdgeBasedOnDestinationYLocation(
        edgeDirectionDictionary[nodeobj]["down"],
        "down"
      );
      for (var i = 0; i < temp.length; i++) sortedEdges.push(temp[i]);
      // }
    }
    return sortedEdges;
  }

  function sortEdgeBasedOnDestinationYLocation(unsortedEdges, dir) {
    return unsortedEdges.sort(function (a, b) {
      if (a.from.includes("added")) return nodes[b.to].y - nodes[a.to].y;
      else if (a.to.includes("removed")) return nodes[a.to].y - nodes[b.to].y;
      else if (nodes[a.to].y < nodes[b.to].y) return -1;
      else if (nodes[a.to].y > nodes[b.to].y) return 1;
      else return 0;
    });
  }

  function sortIncomingEdgeBasedOnDestinationYLocation(unsortedEdges, dir) {
    return unsortedEdges.sort(function (a, b) {
      if (a.from.includes("added"))
        if (nodes[a.to].y > nodes[b.to].y) return -1;
        else return 1;
      // return nodes[b.from].y - nodes[a.from].y;
      else if (a.to.includes("removed"))
        return nodes[a.from].y - nodes[b.from].y;
      else if (nodes[a.from].y < nodes[b.from].y) return 1;
      else if (nodes[a.from].y > nodes[b.from].y) return -1;
      else return 0;
    });
  }

  function nodesAtAdjacentTimesteps(source, destination) {
    var t1 = parseInt(source.substr(1, 1));
    var t2 = parseInt(destination.substr(1, 1));
    if (Math.abs(t2 - t1) <= 1) return true;
    else return false;
  }

  function nodesAreSameSetsInDifferentTimesteps(source, destination) {
    var returnValue = false;
    if (
      source.substr(3, source.length) ===
      destination.substr(3, destination.length)
    ) {
      if (!(source.substr(1, 1) === destination.substr(1, 1)))
        returnValue = true;
    }
    return returnValue;
  }

  function calculateMaxObjectsInConcept(lattices) {
    var max = -1;
    for (var i = 0; i < lattices.length; i++) {
      for (var cid in lattices[i].concepts) {
        if (
          !lattices[i].concepts[cid].isDummy &&
          lattices[i].concepts[cid].name.length > 0
        ) {
          // console.log(lattice.concepts[cid].objects);
          if (lattices[i].concepts[cid].objects.length > max) {
            max = lattices[i].concepts[cid].objects.length;
            // console.log(lattices[i].concepts[cid]);
          }
        }
      }
    }
    if (max > -1) return max;
    else return window.maxNumOfObjectsInAnyConcept;
  }

  function calculateObjectsOverTime(aggregatedLattice, lattices, versions) {
    var data = {};
    // for(var objectId in aggregatedLattice.objects)
    // {
    //     data[objectId]
    // }
    // for(var i=0; i<lattices.length; i++)
    // {
    //     var tempnum = Object.keys(lattices[i].objects).length;
    //     if(0 in lattices[i].objects)
    //         tempnum--;
    //     data[Math.pow(2,i)] = tempnum;

    // }
    var objects = aggregatedLattice.objects;
    for (var i = 0; i < lattices.length; i++) {
      var timestep = Math.pow(2, i);
      var tempnum = 0;
      for (var objectid in objects) {
        if (objectid != "0") {
          if (objects[objectid].version & (timestep > 0)) {
            tempnum++;
          }
        }
      }
      data[timestep] = tempnum;
    }
    return data;
  }

  function conceptNames(lattice) {
    // conceptsKeys = Object.keys(lattice.concepts);
    var conceptNames = [];
    var conceptNameDict = {};
    // for(var i=0; i<conceptKeys.length; i++ )
    //     conceptNames.append(lattice.concept[])
    for (var key in lattice.concepts) {
      tempName = lattice.concepts[key].copyOfFullName;
      if (typeof tempName != "undefined") {
        var res = tempName.split(", ");
        for (var i = 0; i < res.length; i++) {
          if (!(res[i] in conceptNameDict)) conceptNameDict[res[i]] = 0;
        }
        // if( res.length==1 && (!(res[i] in conceptNameDict)))
        //     conceptNameDict[res[0]]=lattice.concepts[key].order;
      }
      // conceptNames.push(lattice.concepts[key].copyOfFullName);
    }

    var orderCounter = 0;
    for (var key in conceptNameDict) {
      conceptNameDict[key] = orderCounter;
      orderCounter += 1;
    }

    // var items = Object.keys(conceptNameDict).map(function(key) {
    //     return [key, conceptNameDict[key]];
    // });

    // // Sort the array based on the second element
    // items.sort(function(first, second) {
    //     return first[1] - second[1];
    // });

    // conceptNamesArray = [];
    // for(var i=0; i<items.length; i++)
    // {
    //     conceptNamesArray.push(items[i][0]);
    // }

    // sort according to the layout left to right from layout
    var tempallconcepts = lattice.concepts;
    var tempDict = {};
    for (var key in tempallconcepts) {
      if (tempallconcepts[key]["isDummy"] == false) {
        if (tempallconcepts[key]["name"].split(",").length == 1) {
          if (
            tempallconcepts[key]["name"] == tempallconcepts[key]["fullName"]
          ) {
            tempDict[tempallconcepts[key]["name"]] =
              tempallconcepts[key]["position"];
          }
        }
      }
    }

    var items = Object.keys(tempDict).map(function (key) {
      return [key, tempDict[key]];
    });

    // Sort the array based on the second element
    items.sort(function (first, second) {
      return first[1] - second[1];
    });

    conceptNamesArray = [];
    for (var i = 0; i < items.length; i++) {
      conceptNamesArray.push(items[i][0]);
    }
    // return Object.keys(conceptNameDict);
    return conceptNamesArray;
  }

  function computeTimeLineData(aggregatedLattice, lattices, versions) {
    var data = {};
    for (var i = 0; i < lattices.length; i++) {
      for (var conceptId in lattices[i].concepts) {
        if (data[conceptId] == undefined) data[conceptId] = {};
        var objects = lattices[i].concepts[conceptId].objects;
        var numOfFilteredObjects = 0;
        for (var j = 0; j < objects.length; j++) {
          if ((objects[j].version & Math.pow(2, i)) > 0) numOfFilteredObjects++;
          // if(conceptId == 1389224513)
          //     console.log((objects[j].version & Math.pow(2,i)), i, j, numOfFilteredObjects, objects[j].version );
        }
        data[conceptId][Math.pow(2, i)] = numOfFilteredObjects;
      }
    }
    return data;
  }

  function calculateObjectTimelineData(lattice) {
    var versions = [];
    var objectTimelineDataDict = {};

    for (var i = 0; i < window.numberOftimesteps; i++)
      versions.push(Math.pow(2, i));

    for (key in lattice.objects) {
      if (!(key in objectTimelineDataDict)) objectTimelineDataDict[key] = {};

      var tempObject = lattice.objects[key];
      for (var i = 0; i < versions.length; i++) {
        var maxContributionsInSelectedTimestamps = -1;
        var objectPresentFlag = false;
        if (tempObject.version & versions[i]) {
          objectTimelineDataDict[key][versions[i]] =
            tempObject.weightsInVersions[versions[i]];
        } else {
          objectTimelineDataDict[key][versions[i]] = 0;
        }
      }
    }
    return objectTimelineDataDict;
  }

  function deconstructGui() {
    d3.select("#mainVisualization").html("");
    // d3.select("#navigation").html("");
    // d3.select("#diffPreviewContainerRow").html("");
    // d3.select("#individualVersionRow").html("");
    // d3.select("#selectionBar").html("");
    // d3.selectAll(".authorEvolutionRow").remove();
    // d3.select("#selectionObjectsNum").selectAll("*").remove();
  }
  /////////////////// Lattice data processing ///////////////////
  /**
   * Takes a CSV string and parses it into a context object.
   */
  function parseContextFromCsv(text) {
    var context = {
      attributes: {},
      objects: {},
    };
    var rows = d3.csv.parseRows(text);
    // First row is a header with object names.
    var header = rows.shift();
    // Other rows correspond to attributes.
    var attributesRaw = rows.map(function (e) {
      return e[0];
    });
    // First column in the header is empty.
    header.shift();
    var objectsRaw = header;
    // Create attributes in the context;
    attributesRaw.forEach(function (attr, i) {
      var attribute = {
        id: hash(attr),
        name: attr,
        objects: [],
        weights: [],
      };
      context.attributes[attribute.id] = attribute;
    });
    // Create objects in the context.
    objectsRaw.forEach(function (obj, i) {
      var object = {
        id: hash(obj),
        name: obj,
        attributes: [],
        weights: [],
      };
      context.objects[object.id] = object;
    });
    // Load object-attribute assignments data.
    // var attributesList = d3.values(context.attributes);
    var attributesList = [];
    for (var i = 0; i < attributesRaw.length; i++) {
      attributesList.push(context.attributes[hash(attributesRaw[i])]);
    }
    // var objectsList = d3.values(context.objects);
    var objectsList = [];
    for (var i = 0; i < objectsRaw.length; i++) {
      objectsList.push(context.objects[hash(objectsRaw[i])]);
    }
    for (
      var attributeIndex = 0;
      attributeIndex < rows.length;
      attributeIndex++
    ) {
      var row = rows[attributeIndex];
      // First column in each row is the attribute's name.
      row.shift();
      for (var objectIndex = 0; objectIndex < row.length; objectIndex++) {
        // var weight = parseInt(row[objectIndex], 10);
        var weight = parseFloat(row[objectIndex], 10);
        weightThreshold = 0.0;
        if (weight > weightThreshold) {
          var attribute = attributesList[attributeIndex];
          var object = objectsList[objectIndex];
          attribute.objects.push(object.id);
          attribute.weights.push(weight);
          object.attributes.push(attribute.id);
          object.weights.push(weight);
        }
      }
    }
    return context;
  }

  function powerSet(list) {
    var set = [],
      listSize = list.length,
      combinationsCount = 1 << listSize,
      combination;

    for (var i = 1; i < combinationsCount; i++) {
      var combination = [];
      for (var j = 0; j < listSize; j++) {
        if (i & (1 << j)) {
          combination.push(list[j]);
        }
      }
      set.push(combination);
    }
    return set;
  }
  /**
   * Run the NextClosure algorithm on the context object, generating
   * an "input lattice" as a result.
   * An "input lattice" is a concise representation of a single lattice,
   * that is suitable for text representation.
   */
  function performFcaOnContext(context) {
    var attributesArray = d3.values(context.attributes).map(function (attr) {
      return attr.id;
    });
    // NextClosure algorithm.
    // var intents = [];
    // var currentIntent = closure([]);
    // while (currentIntent != null && currentIntent.length != context.attributes.length)
    // {
    //     intents.push(currentIntent);
    //     currentIntent = getLeastGreaterIntent(currentIntent);

    // }
    // console.log(intents);
    intents = powerSet(attributesArray);
    // We've computed all the intents, the algorithm is finished.
    // The first and the last intents are uninteresting.
    /*
         The program throws error if there is no "valid" lattice structure
            eg.
            ,A,B
            c1,0.6,1
            c2,1,0.6
            c3,1,0.2

            is not a valid input (for the program) - as every author is contributing in every module. And the program deletes the first and last intents (line 367 and 368) as they are trivial cases which signify null set and complete set.

            Solution - To avoid this it can be checked that whether the intent array has how many inputs. Minimum it should have 3 for program to run without error. Adding the following if condition for this check

            */
    // if(intents.length>2)
    // {
    // intents.shift();
    // intents.push([1815774618,866315194]);

    //     intents.pop();
    // }
    // Create an empty lattice.
    var lattice = {
      concepts: null,
      objects: null,
      attributes: null,
      conceptToConcept: null,
    };
    // Build a concept list from the list of intents.
    lattice.concepts = intents.map(function (intent, i) {
      var intentString = intent.reduce(function (result, current) {
        return result + "," + current;
      }, "");
      var concept = {
        id: hash(intentString),
        name: "",
        intent: intent,
        layer: intent.length,
        objects: [],
        // Attributes that are part of the intent of the other concept,
        // which is a generalization of this one (there's an edge from it to this one in the lattice).
        // The field is used for reduced labeling.
        inheritedIntent: [],
      };
      // console.log(getExtent(intent));
      // Build a list of objects based on the extent.
      getExtent(intent).forEach(function (objectId) {
        // Compute total weight as a sum of weights between the object and attributes in this concept.
        var attributesInThisConcept = intent.map(function (attrId) {
          return context.attributes[attrId];
        });
        var totalWeight = attributesInThisConcept.reduce(function (
          totalWeight,
          attr
        ) {
          var objectIndex = attr.objects.indexOf(objectId);
          if (objectIndex != -1) return totalWeight + attr.weights[objectIndex];
          return totalWeight;
        },
        0);
        // Create an object in the lattice.
        concept.objects.push({
          object: objectId,
          weight: totalWeight,
        });
      });
      return concept;
    });
    // Build an objects list.
    lattice.objects = d3.values(context.objects).map(function (object) {
      return {
        id: object.id,
        name: object.name,
      };
    });
    // Build an attributes list.
    lattice.attributes = d3
      .values(context.attributes)
      .map(function (attribute) {
        return {
          id: attribute.id,
          name: attribute.name,
        };
      });
    // Compute and save concept-concept relations.
    lattice.conceptToConcept = [];
    for (var i = 0; i < lattice.concepts.length; i++) {
      var conceptA = lattice.concepts[i];
      for (var j = 0; j < lattice.concepts.length; j++) {
        var conceptB = lattice.concepts[j];
        if (i != j && isSubset(conceptA.intent, conceptB.intent)) {
          lattice.conceptToConcept.push({
            from: conceptA.id,
            to: conceptB.id,
          });
          Array.prototype.push.apply(conceptB.inheritedIntent, conceptA.intent);
        }
      }
    }
    // Perform transitive edge reduction.
    var findEdge = function (conceptIdA, conceptIdB) {
      return lattice.conceptToConcept.find(function (edge) {
        return edge.from == conceptIdA && edge.to == conceptIdB;
      });
    };
    for (i = 0; i < lattice.concepts.length; i++) {
      conceptA = lattice.concepts[i];
      for (j = 0; j < lattice.concepts.length; j++) {
        conceptB = lattice.concepts[j];
        for (var k = 0; k < lattice.concepts.length; k++) {
          var conceptC = lattice.concepts[k];
          var edgeAB = findEdge(conceptA.id, conceptB.id);
          var edgeBC = findEdge(conceptB.id, conceptC.id);
          var edgeAC = findEdge(conceptA.id, conceptC.id);
          if (edgeAB && edgeBC && edgeAC) {
            var index = lattice.conceptToConcept.indexOf(edgeAC);
            lattice.conceptToConcept.splice(index, 1);
          }
        }
      }
    }
    // Apply the 'reduced labeling' to the concepts.
    lattice.concepts.forEach(function (concept) {
      // Labels should be sorted alphabetically.
      var comparator = function (id1, id2) {
        return -context.attributes[id1].name.localeCompare(
          context.attributes[id2].name
        );
      };
      concept.intent.sort(comparator);
      concept.inheritedIntent.sort(comparator);
      // the reduced label of the concept is the list of its non-inherited attributes.
      var notInheritedAttributes = subtract(
        concept.intent,
        concept.inheritedIntent
      );
      var conceptLabel = notInheritedAttributes.reduce(function (
        result,
        attrId
      ) {
        return result + context.attributes[attrId].name + ", ";
      },
      "");
      conceptLabel = conceptLabel.slice(0, -2);
      // The full label of the concept is the list of all of its attributes.
      var fullConceptLabel = concept.intent.reduce(function (result, attrId) {
        return result + context.attributes[attrId].name + ", ";
      }, "");
      fullConceptLabel = fullConceptLabel.slice(0, -2);
      concept.name = conceptLabel;
      concept.fullName = fullConceptLabel;
    });
    return lattice;

    function getLeastGreaterIntent(intent) {
      for (var i = attributesArray.length - 1; i >= 0; i--) {
        var circledPlusResult = circledPlusOperation(intent, i);
        var tempValue = isLexicographicallySmaller(
          intent,
          circledPlusResult,
          i
        );
        // console.log(intent, i , tempValue);
        // if(arraysAreEqual(intent, circledPlusResult)) return intent;
        if (tempValue) return circledPlusResult;
      }
      return null;
    }

    function circledPlusOperation(intent, attributeIndex) {
      var precedingAttributes = getPrecedingAttributes(attributeIndex);
      var intersection = intersect(intent, precedingAttributes);
      intersection.push(attributesArray[attributeIndex]);
      return closure(intersection);
    }

    function isLexicographicallySmaller(intentA, intentB, attributeIndex) {
      var attrId = attributesArray[attributeIndex];
      var isInDiff = subtract(intentB, intentA).indexOf(attrId) != -1;
      if (!isInDiff) return false;
      var precedingAttributes = getPrecedingAttributes(attributeIndex);
      var intersectionA = intersect(intentA, precedingAttributes);
      var intersectionB = intersect(intentB, precedingAttributes);
      return arraysAreEqual(intersectionA, intersectionB);
    }

    function getPrecedingAttributes(attributeIndex) {
      var precedingAttributes = [];
      for (var i = 0; i < attributesArray.length && i < attributeIndex; i++) {
        precedingAttributes.push(attributesArray[i]);
      }
      return precedingAttributes;
    }

    function arraysAreEqual(arrayA, arrayB) {
      if (arrayA === arrayB) return true;
      if (arrayA == null || arrayB == null) return false;
      if (arrayA.length != arrayB.length) return false;
      arrayA.sort();
      arrayB.sort();
      for (var i = 0; i < arrayA.length; ++i) {
        if (arrayA[i] !== arrayB[i]) return false;
      }
      return true;
    }

    function isSubset(subset, superset) {
      return arraysAreEqual(subset, intersect(subset, superset));
    }

    function subtract(arrayA, arrayB) {
      return arrayA.filter(function (element) {
        return arrayB.indexOf(element) === -1;
      });
    }

    function intersect(arrayA, arrayB) {
      return arrayA.filter(function (element) {
        return arrayB.indexOf(element) != -1;
      });
    }

    function closure(intent) {
      return getIntent(getExtent(intent));
    }

    function getExtent(intent) {
      var extent = [];
      var objects = d3.values(context.objects);
      for (var i = 0; i < objects.length; i++) {
        var object = objects[i];
        var objectIsInExtent = true;
        for (var j = 0; j < intent.length; j++) {
          var attribute = intent[j];
          objectIsInExtent =
            objectIsInExtent && object.attributes.indexOf(attribute) >= 0;
          if (!objectIsInExtent) break;
        }
        if (objectIsInExtent) extent.push(object.id);
      }
      return extent;
    }

    function getIntent(extent) {
      var intent = [];
      var tempmpdulo2 = 0;
      var attributes = d3.values(context.attributes);
      for (var i = 0; i < attributes.length; i++) {
        var attribute = attributes[i];
        var attrIsInIntent = true;
        for (var j = 0; j < extent.length; j++) {
          var object = extent[j];
          attrIsInIntent =
            attrIsInIntent && attribute.objects.indexOf(object) >= 0;
          if (!attrIsInIntent) break;
        }
        if (attrIsInIntent) {
          tempmpdulo2++;
          intent.push(attribute.id);
        }
        // if(tempmpdulo2 % 10 > 0) return intent;
      }
      return intent;
    }
  }
  /**
   * Converts an "input lattice" to a lattice object, which is capable
   * of representing multiple lattices and is suitable for rendering.
   * (e.g. IDs are replaced by actual object references)
   */
  function convertInputToLattice(input, version) {
    var tempConcepts = [];
    for (var j = 0; j < input.concepts.length; j++) {
      conceptId = input.concepts[j].id;
      if (input.concepts[j].objects.length == 0) {
        // delete input.concepts[conceptId];
        var tempconceptToConcepts = [];
        for (var i = 0; i < input.conceptToConcept.length; i++) {
          if (
            input.conceptToConcept[i].from != conceptId &&
            input.conceptToConcept[i].to != conceptId
          )
            tempconceptToConcepts.push(input.conceptToConcept[i]);
        }
        input.conceptToConcept = tempconceptToConcepts;
      } else {
        tempConcepts.push(input.concepts[j]);
      }
    }
    input.concepts = tempConcepts;
    var i, object, concept;
    var lattice = {
      concepts: {},
      objects: {},
    };
    // Construct concepts.
    for (i = 0; i < input.concepts.length; i++) {
      var inputConcept = input.concepts[i];
      concept = {
        id: inputConcept.id,
        name: inputConcept.name ? inputConcept.name : "",
        fullName: inputConcept.fullName ? inputConcept.fullName : "",
        intent: inputConcept.intent ? inputConcept.intent : [],
        version: version,
        layer: inputConcept.layer,
        parents: [],
        children: [],
        objects: [],
      };
      lattice.concepts[concept.id] = concept;
    }
    // Construct objects.
    for (i = 0; i < input.objects.length; i++) {
      var inputObject = input.objects[i];
      object = {
        id: inputObject.id,
        name: inputObject.name,
        version: version,
        concepts: [],
      };
      lattice.objects[object.id] = object;
    }
    // Resolve concept relations.
    for (i = 0; i < input.conceptToConcept.length; i++) {
      var inputConceptLink = input.conceptToConcept[i];
      var conceptFrom = lattice.concepts[inputConceptLink.from];
      var conceptTo = lattice.concepts[inputConceptLink.to];
      conceptFrom.children.push({
        conceptId: conceptTo.id,
        version: version,
      });
      conceptTo.parents.push({
        conceptId: conceptFrom.id,
        version: version,
      });
    }
    // Resolve object to concept relations.
    for (i = 0; i < input.concepts.length; i++) {
      inputConcept = input.concepts[i];
      for (var j = 0; j < inputConcept.objects.length; j++) {
        var inputObjectLink = inputConcept.objects[j];
        object = lattice.objects[inputObjectLink.object];
        concept = lattice.concepts[inputConcept.id];
        if (!object)
          console.error("Object " + inputObjectLink.object + "doesn't exist");
        if (!concept)
          console.error("Concept " + inputObjectLink.concept + "doesn't exist");
        var objectEdge = {
          objectId: object.id,
          conceptId: concept.id,
          weights: {},
          version: version,
        };
        objectEdge.weights[version] = inputObjectLink.weight;
        concept.objects.push(objectEdge);
        var conceptEdge = {
          conceptId: concept.id,
          weights: {},
          version: version,
        };
        conceptEdge.weights[version] = inputObjectLink.weight;
        object.concepts.push(conceptEdge);
      }
    }
    return lattice;
  }
  /**
   * Combines two lattice objects into one preserving version information.
   * LatticeA objects is modified.
   */
  function addLatticeBtoLatticeA(latticeA, latticeB) {
    var i, conceptId, conceptA, conceptB, objectA, objectB, childA, copy;
    // First, merge all objects from A and B.
    for (var objectId in latticeB.objects) {
      objectB = latticeB.objects[objectId];
      // Check, if A has this object.
      if (latticeA.objects.hasOwnProperty(objectId)) {
        // It has, update the version.
        objectA = latticeA.objects[objectId];
        objectA.version = objectA.version | objectB.version;
      } else {
        // It doesn't have, copy it over.
        copy = clone(objectB);
        // Remove all the edges, they will be merged separately.
        copy.concepts = [];
        latticeA.objects[objectId] = copy;
      }
    }
    // Then, merge all concepts from A and B.
    for (conceptId in latticeB.concepts) {
      conceptB = latticeB.concepts[conceptId];
      // Check if A has this concept already.
      if (latticeA.concepts.hasOwnProperty(conceptId)) {
        // It has, update the version.
        conceptA = latticeA.concepts[conceptId];
        conceptA.version = conceptA.version | conceptB.version;
      } else {
        // A doesn't have the concept, copy it over.
        copy = clone(conceptB);
        // Remove all the edges, they will be merged separately.
        copy.parents = [];
        copy.children = [];
        copy.objects = [];
        latticeA.concepts[conceptId] = copy;
      }
    }
    // Merge all object edges from B and A.
    for (conceptId in latticeB.concepts) {
      conceptB = latticeB.concepts[conceptId];
      conceptA = latticeA.concepts[conceptId];
      for (i = 0; i < conceptB.objects.length; i++) {
        var objectEdgeB = conceptB.objects[i];
        objectB = latticeB.objects[objectEdgeB.objectId];
        // Get the object itself, it has to exist, since we merged them already.
        objectA = latticeA.objects[objectEdgeB.objectId];
        // The corresponding object-to-concept edge that is stored in the object.
        var conceptEdgeB = objectB.concepts.find(function (el) {
          return el.conceptId === conceptB.id;
        });
        var objectEdgeA = conceptA.objects.find(function (el) {
          return el.objectId === objectEdgeB.objectId;
        });
        if (objectEdgeA) {
          var conceptEdgeA = objectA.concepts.find(function (el) {
            return el.conceptId === conceptA.id;
          });
          // Update the version.
          objectEdgeA.version = objectEdgeA.version | objectEdgeB.version;
          conceptEdgeA.version = conceptEdgeA.version | conceptEdgeB.version;
          // Merge the version-weight information.
          for (var version in objectEdgeB.weights) {
            objectEdgeA.weights[version] = objectEdgeB.weights[version];
            conceptEdgeA.weights[version] = conceptEdgeB.weights[version];
          }
        } else {
          conceptA.objects.push(objectEdgeB);
          objectA.concepts.push(conceptEdgeB);
        }
      }
    }
    // Next, merge all edges from B and A.
    for (conceptId in latticeB.concepts) {
      conceptB = latticeB.concepts[conceptId];
      conceptA = latticeA.concepts[conceptId];
      // Compare all the outgoing edges.
      for (i = 0; i < conceptB.children.length; i++) {
        var childEdgeB = conceptB.children[i];
        // Find the corresponding edge in A.
        var childEdgeA = conceptA.children.find(function (el) {
          return el.conceptId === childEdgeB.conceptId;
        });
        if (childEdgeA) {
          // The edge is present in A, just update its version and
          // version of the 'parent' back edge.
          childA = latticeA.concepts[childEdgeA.conceptId];
          var parentEdgeA = childA.parents.find(function (el) {
            return el.conceptId === conceptA.id;
          });
          childEdgeA.version = childEdgeA.version | childEdgeB.version;
          parentEdgeA.version = childEdgeA.version | childEdgeB.version;
        } else {
          // The edge is not present, create it and a corresponding 'parent' back edge.
          conceptA.children.push(childEdgeB);
          childA = latticeA.concepts[childEdgeB.conceptId];
          childA.parents.push({
            conceptId: conceptA.id,
            version: childEdgeB.version,
          });
        }
      }
    }
  }
  /**
   * Finds all the concept-to-concept edges in the lattice (including transitive)
   * and saves them for future use.
   */
  function computeTransitiveRelations(lattice) {
    var conceptList = d3.values(lattice.concepts);
    for (var i = 0; i < conceptList.length; i++) {
      var concept = conceptList[i];
      concept.childrenTransitive = [];
      concept.parentsTransitive = [];
    }
    for (i = 0; i < conceptList.length; i++) {
      var conceptA = conceptList[i];
      for (var j = 0; j < conceptList.length; j++) {
        if (i == j) continue;
        var conceptB = conceptList[j];
        if (isSubset(conceptA.intent, conceptB.intent)) {
          conceptA.childrenTransitive.push({
            conceptId: conceptB.id,
            version: 0,
          });
          conceptB.parentsTransitive.push({
            conceptId: conceptA.id,
            version: 0,
          });
        }
      }
    }
  }
  /**
   * Computes layout and adds the resulting data to the lattice.
   */
  function computeLatticeLayout(lattice) {
    var i, concept, conceptId;
    // Segregate concepts according to their layers.
    var layers = {};
    for (conceptId in lattice.concepts) {
      concept = lattice.concepts[conceptId];
      if (!layers[concept.layer]) {
        layers[concept.layer] = [];
      }
      // Create temporary adjacency lists, so that the originals won't be altered.
      concept.childrenFiltered = [];
      concept.parentsFiltered = [];
      concept.isDummy = false;
      layers[concept.layer].push(concept);
    }
    var dummyConceptCounter = 0;
    // Remove edges that cross multiple layers by introducing intermediate dummy concepts.
    for (conceptId in lattice.concepts) {
      concept = lattice.concepts[conceptId];
      for (i = 0; i < concept.children.length; i++) {
        var edge = concept.children[i];
        var child = lattice.concepts[edge.conceptId];
        edge.dummies = [];
        var layerDelta = child.layer - concept.layer;
        if (layerDelta == 1) {
          edge.isMultilayer = false;
          // One layer edge, copy it over unchanged.
          concept.childrenFiltered.push(child);
          child.parentsFiltered.push(concept);
        } else {
          edge.isMultilayer = true;
          // The edge crosses multiple layers, introduce dummy nodes.
          var previousConcept = concept;
          // Walk the layers, creating a dummy node at each of them.
          for (
            var currentLayerIndex = concept.layer + 1;
            currentLayerIndex < concept.layer + layerDelta;
            currentLayerIndex++
          ) // for (var currentlayerIndexinLayersArray =0; currentlayerIndexinLayersArray< Object.keys(layers).length; currentlayerIndexinLayersArray++ )
          {
            //a quick fix
            // var currentLayerIndex = Object.keys(layers)[currentlayerIndexinLayersArray];
            var dummyConcept = {
              id: hash("dummy" + dummyConceptCounter++),
              intent: [],
              version: concept.children[i].version,
              isDummy: true,
              layer: currentLayerIndex,
              parentsFiltered: [previousConcept],
              childrenFiltered: [],
              objects: [],
              children: [],
            };
            lattice.concepts[dummyConcept.id] = dummyConcept;
            edge.dummies.push(dummyConcept.id);
            previousConcept.childrenFiltered.push(dummyConcept);
            // console.log(currentLayerIndex, layers);
            if (!layers[currentLayerIndex]) {
              layers[currentLayerIndex] = [];
            }
            layers[currentLayerIndex].push(dummyConcept);
            previousConcept = dummyConcept;
          }
          // Connect the last dummy node.
          previousConcept.childrenFiltered.push(child);
          child.parentsFiltered.push(previousConcept);
        }
      }
    }
    var stringToInt = function (el) {
      return parseInt(el);
    };
    var minLayerIndex = d3.min(d3.keys(layers).map(stringToInt));
    var maxLayerIndex = d3.max(d3.keys(layers).map(stringToInt));
    var sweepCounter = 0;
    var increment = -1;
    var currentLayerIndex = minLayerIndex;
    // Initialize positions of the first layer (based on their order in the array).
    for (i = 0; i < layers[currentLayerIndex].length; i++) {
      concept = layers[currentLayerIndex][i];
      concept.order = i + 1;
    }
    // Compute node ordering.
    // Perform sweeps back and forth through the graph,
    // rearranging the nodes. (Barycentric method)
    while (++sweepCounter <= 20) {
      increment = -increment;
      currentLayerIndex += increment;
      if (!layers.hasOwnProperty(currentLayerIndex)) {
        continue;
      }
      // Perform one sweep up or down.
      var stopSweep = false;
      while (!stopSweep) {
        // Update order of each node in the layer.
        for (i = 0; i < layers[currentLayerIndex].length; i++) {
          concept = layers[currentLayerIndex][i];
          var neighbors =
            increment === 1
              ? concept.parentsFiltered
              : concept.childrenFiltered;
          // Save the previous order value, which is used as a secondary sorting criteria.
          concept.oldOrder = concept.order;
          // Calculate an average neighbor order for each concept in the layer.
          if (neighbors.length > 0) {
            var neighborPositionSum = neighbors.reduce(function (
              current,
              neighbor
            ) {
              return current + neighbor.order;
            },
            0);
            concept.order = neighborPositionSum / neighbors.length;
          } else {
            // Let unconnected nodes always be on the right.
            concept.order = Number.MAX_VALUE;
          }
        }
        // Sort concepts in the layer according to their newly computed order.
        layers[currentLayerIndex].sort(function (conceptA, conceptB) {
          if (conceptA.order < conceptB.order) return -1;
          else if (conceptA.order == conceptB.order) {
            if (conceptA.oldOrder < conceptB.oldOrder) {
              return -1;
            } else if (conceptA.oldOrder == conceptB.oldOrder) {
              return 0;
            } else {
              return 1;
            }
          } else return 1;
        });
        // Assign order values according to the order of the concepts.
        for (i = 0; i < layers[currentLayerIndex].length; i++) {
          concept = layers[currentLayerIndex][i];
          concept.order = i + 1;
        }
        if (
          currentLayerIndex > minLayerIndex &&
          currentLayerIndex < maxLayerIndex
        )
          currentLayerIndex += increment;
        else stopSweep = true;
      }
    }
    // Compute actual node positions.
    var conceptWidthFull = visParams.conceptWidth + visParams.conceptMargin * 2;
    var dummyWidthFull = visParams.dummyWidth + visParams.dummyMargin * 2;
    // Initialize positions considering node width.
    var widestLayerWidth = 0;
    var widestLayerIndex = 0;
    for (currentLayerIndex in layers) {
      var currentLayer = layers[currentLayerIndex];
      var currentPosition = 0;
      for (i = 0; i < currentLayer.length; i++) {
        concept = currentLayer[i];
        if (concept.isDummy) {
          concept.position = currentPosition;
          currentPosition += dummyWidthFull;
        } else {
          concept.position = currentPosition;
          currentPosition += conceptWidthFull;
        }
      }
      if (currentPosition > widestLayerWidth) {
        widestLayerWidth = currentPosition;
        widestLayerIndex = parseInt(currentLayerIndex);
      }
    }
    // Perform a sweep up from the widest layer.
    performSweep(widestLayerIndex, 1);
    // Perform a sweep down from the widest layer.
    performSweep(widestLayerIndex, -1);
    // An ad-hoc algorithm is used.
    // We walk right-to-left in the layer, adding more and more nodes to the 'current node group'.
    // If at any point there are more nodes that want to shift to the right than nodes that don't,
    // we perform a shift. Shift distance is determined by the smallest shift desired by a node in the group
    // and is also limited by the amount of whitespace available on the right.
    // This operation is performed multiple times on a layer, trying to reach a local minimum.
    function performSweep(widestLayerIndex, increment) {
      currentLayerIndex = widestLayerIndex;
      while (
        currentLayerIndex <= maxLayerIndex &&
        currentLayerIndex >= minLayerIndex
      ) {
        currentLayerIndex += increment;
        currentLayer = layers[currentLayerIndex];
        if (!currentLayer || currentLayer.length == 0) continue;
        sweepCounter = 0;
        while (sweepCounter++ < 10) {
          var voteBalance = 0;
          var maxShift = Number.MAX_VALUE;
          var currentNodeGroup = [];
          var whitespaceBeforeLastNode;
          var whitespaceAvailableForShift;
          for (
            var conceptIndex = currentLayer.length - 1;
            conceptIndex >= 0;
            conceptIndex--
          ) {
            concept = currentLayer[conceptIndex];
            var nodeWidth = concept.isDummy ? dummyWidthFull : conceptWidthFull;
            if (conceptIndex === currentLayer.length - 1)
              whitespaceBeforeLastNode =
                widestLayerWidth - (concept.position + nodeWidth);
            else
              whitespaceBeforeLastNode =
                currentLayer[conceptIndex + 1].position -
                concept.position -
                nodeWidth;
            if (currentNodeGroup.length == 0) {
              // We've started a new group, update the whitespace available for it.
              whitespaceAvailableForShift = whitespaceBeforeLastNode;
            } else if (whitespaceBeforeLastNode > 0.01) {
              // We've encountered some whitespace in the layer, node group ends here, start a new one.
              currentNodeGroup = [];
              voteBalance = 0;
              maxShift = Number.MAX_VALUE;
              whitespaceAvailableForShift = whitespaceBeforeLastNode;
            }
            currentNodeGroup.push(concept);
            neighbors =
              increment > 0
                ? concept.parentsFiltered
                : concept.childrenFiltered;
            var idealNodePosition =
              neighbors.reduce(function (result, node) {
                return result + node.position;
              }, 0) / neighbors.length;
            // If dummy is connected to a single concept, align try to align it to the center of that concept.
            if (
              concept.isDummy &&
              neighbors.length == 1 &&
              !neighbors[0].isDummy
            )
              idealNodePosition += (conceptWidthFull - dummyWidthFull) / 2;
            if (neighbors.length === 0)
              idealNodePosition =
                concept.position + whitespaceAvailableForShift;
            if (concept.position < idealNodePosition) {
              voteBalance++;
              maxShift = Math.min(
                maxShift,
                idealNodePosition - concept.position
              );
            } else if (concept.position > idealNodePosition) voteBalance--;
            if (voteBalance > 0) {
              // Current node group wants to shift, do it and reset everything.
              var shift = Math.min(maxShift, whitespaceAvailableForShift);
              currentNodeGroup.forEach(function (c) {
                return (c.position += shift);
              });
              currentNodeGroup = [];
              voteBalance = 0;
              maxShift = Number.MAX_VALUE;
              continue;
            }
            // Group doesn't want to shift, continue adding nodes to see if this changes.
          }
        }
      }
    }
    calculateHighestLevelofObjects(lattice);
  }

  function calculateHighestLevelofObjects(lattice) {
    var objects = lattice.objects;
    var concepts = lattice.concepts;
    for (var objectIdKey in objects) {
      // var highestLayerNum=-1;
      // var highestLayerInVersion = -1;
      var highestLayerInfo = {};
      var weightsInVersions = {};
      var aggregateLatticeHighestLayerNumber = -1;
      // var tempDict = {
      //         version: highestLayerNum
      //     }
      if (objects.hasOwnProperty(objectIdKey)) {
        var tempConcepts = objects[objectIdKey].concepts;
        for (var index in tempConcepts) {
          var tempConceptId = tempConcepts[index].conceptId;
          var weightsDict = tempConcepts[index].weights;
          var tempLayerNum = concepts[tempConceptId].layer;
          aggregateLatticeHighestLayerNumber =
            tempLayerNum > aggregateLatticeHighestLayerNumber
              ? tempLayerNum
              : aggregateLatticeHighestLayerNumber;
          for (var versionNumber in weightsDict) {
            if (highestLayerInfo.hasOwnProperty(versionNumber)) {
              if (highestLayerInfo[versionNumber] < tempLayerNum)
                highestLayerInfo[versionNumber] = tempLayerNum;
            } else {
              highestLayerInfo[versionNumber] = tempLayerNum;
            }

            if (weightsInVersions.hasOwnProperty(versionNumber)) {
              if (weightsInVersions[versionNumber] < weightsDict[versionNumber])
                weightsInVersions[versionNumber] = weightsDict[versionNumber];
            } else {
              weightsInVersions[versionNumber] = weightsDict[versionNumber];
            }
          }
        }
      }
      lattice.objects[objectIdKey].highestLayerInfo = highestLayerInfo;
      lattice.objects[objectIdKey].weightsInVersions = weightsInVersions;
      lattice.objects[objectIdKey].highestLayerNumberInAggregateLattice =
        aggregateLatticeHighestLayerNumber;
    }
  }

  /////////////////// Utilities /////////////////
  function hash(s) {
    var nHash = 0;
    if (!s.length) return nHash;
    for (var i = 0, imax = s.length, n; i < imax; ++i) {
      n = s.charCodeAt(i);
      nHash = (nHash << 5) - nHash + n;
      nHash = nHash & nHash; // Convert to 32-bit integer
    }
    return Math.abs(nHash);
  }

  function clone(obj) {
    var copy;
    // Handle the 3 simple types, and null or undefined
    if (null == obj || "object" != typeof obj) return obj;
    // Handle Date
    if (obj instanceof Date) {
      copy = new Date();
      copy.setTime(obj.getTime());
      return copy;
    }
    // Handle Array
    if (obj instanceof Array) {
      copy = [];
      for (var i = 0, len = obj.length; i < len; i++) {
        copy[i] = clone(obj[i]);
      }
      return copy;
    }
    // Handle Object
    if (obj instanceof Object) {
      copy = {};
      for (var attr in obj) {
        if (obj.hasOwnProperty(attr)) copy[attr] = clone(obj[attr]);
      }
      return copy;
    }
    throw new Error("Unable to copy obj! Its type isn't supported.");
  }

  function isSubset(subset, set) {
    for (var i = 0; i < subset.length; i++) {
      var element = subset[i];
      if (set.indexOf(element) == -1) return false;
    }
    return true;
  }
  return vis;
}
