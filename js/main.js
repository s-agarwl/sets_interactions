
window.onload = function () {
    datasetSelection.init();
    selectionPanel.init();
};

const datasetSelection = function () {

    return {

        // TODO: replace index by id
        currentLoadedDatasetIndex: 0,
        currentId: "",

        init: function () {
            currentLoadedDatasetIndex = 0;
            // this.currentId = Object.keys(window.datasets)[0];
            this.currentId = "tech";
            // this.currentId = "csresearch";
            window.currentDatasetId = this.currentId;
            const datasetDropDown = $('#datasetDropDown');
            
            Object.keys(window.datasets).forEach(datasetId => {
                dataset = window.datasets[datasetId];
                var selected = "";
                if(window.currentDatasetId == datasetId)
                    selected = "selected";
                datasetDropDown.append($(`<option value="${datasetId}" ${selected}>${dataset.name}</option>`));
            })
            visObject = DynaSet().loadHarcodedDatasetFromJavascriptObject(this.currentId);
            const timestepLabels = $('.timestepLabel');
            datasetDropDown.on('change', function () {

                datasetSelection.currentId = datasetDropDown.val();
                window.currentDatasetId = datasetSelection.currentId;
                visObject.loadHarcodedDatasetFromJavascriptObject(datasetSelection.currentId);
                selectionPanel.init();
            });

            timestepLabels.on('click', function(e){
                // var timestepIndex = parseInt($(this).attr('timestepIndex'));
                // visObject = DynaSet().loadHarcodedDatasetFromJavascriptObject(datasetSelection.currentId, timestepIndex);
                // visObject.computeGraphLayout(timestepIndex);
            })
            
        },

        toggleDataSetInformation: function () {
            $('#id01').toggle();
        }

    }

}();

const selectionPanel = function () {

    function initGroupSelection(group) {
        const selectionDiv = $(`#selection${group}`);
        selectionDiv.html("");
        // TODO: implement exclusive intersection
        $(`<input type="radio" id="radio${group}" name="groupSelection">  <span class="groupLabel group${group}">Group ${group}: # 0</span>
            <span class="edgeSelectionText" style="display:none"></span>
            <span class="selectionForm">
                 &ndash;
                Elements in the 
                <select class="selectionSetOperation" >
                    <option>intersection</option>
                    <option>exclusive intersection</option>
                    <option>union</option>
                    <option>k-set intersections</option>
                </select> 
                <span class="conjunction">of</span> 
                <span  class="selectionSets">${initBaseSetSelection(group)}</span>
                <select class="degreeSelection" style="display:none">${initDegreeSelection(group)}
                </select>
                at timestep 
                <select class="selectionTimestep">${initTimestepSelection()}</select>    
            <span>`)
            .appendTo(selectionDiv);
        $(`<button class="addButton">+</button>`)
            .click(() => addGroupSelection(group))
            .appendTo(selectionDiv);
        $(`<button class="clearButton">x</button>`)
            .click(() => clearGroupSelection(group))
            .appendTo(selectionDiv);
            
        $(`#selection${group} .selectionSetOperation`).on("change", function(d){
            var changedValue = $(`#selection${group} .selectionSetOperation`).val();
            if(changedValue == "k-set intersections")
            {
                $(`#selection${group} .selectionSets`).attr("style","display:none");
                $(`#selection${group} .degreeSelection`).attr("style","display:inline");
                $(`#selection${group} .conjunction`).text(", where k = ");
            }
            else
            {
                $(`#selection${group} .selectionSets`).attr("style","display:inline");
                $(`#selection${group} .degreeSelection`).attr("style","display:none");
                $(`#selection${group} .conjunction`).text(" of ");

            }
        });
        // $(`#radioA`).prop("checked", true);
        $(`#radioSelection`).prop("checked", true);
        selectionDiv.find(`input, select`).change(() => updateQuery(group));
    }

    function initBaseSetSelection(group) {
        let s = "";
        visObject.getBaseSetNames().forEach((setName, i) => {
            s += `<span class="setCheckbox" ><input type="checkbox" value="${setName}" id="checkbox${group}${i}"><label for="checkbox${group}${i}">${setName}</label></input></span>`;
        });
        return s;
    }

    function initDegreeSelection(group){
        let s = "";
        visObject.getBaseSetNames().forEach((setName, i) => {
            s += `<option value="${i+1}">${i+1}</option>`;
        });
        return s;
    }

    function initTimestepSelection() {
        let s = "";
        visObject.getTimesteps().forEach(timestep => {
            s += `<option value="${timestep}">${timestep}</option>`;
        });
        return s;
    }

    function addGroupSelection(group) {
        $(`#selection${group} .selectionForm`).show();
        $(`#selection${group} .addButton`).hide();
        $(`#selection${group} .clearButton`).show();
        $(`#selection${group} .groupLabel`).addClass("active");
        // $(`#radio${group}`).attr("disabled", false);
        $(`#selectionAB .groupLabel`).addClass(`active${group}`);
        $(`#radio${group}`).prop("checked", true);
        updateQuery(group);
    }

    function clearGroupSelection(group) {
        $(`#selection${group} .edgeSelectionText`).hide();
        $(`#selection${group} .selectionForm`).hide();
        $(`#selection${group} .addButton`).show();
        $(`#selection${group} .clearButton`).hide()
        $(`#selection${group} .groupLabel`).removeClass("active");
        // $(`#radio${group}`).attr("disabled", true);
        $(`#selectionAB .groupLabel`).removeClass(`active${group}`);
        resetSelection(group);
        updateQuery(group);
    }

    function updateQuery(group) {
        const operator = $(`#selection${group} .selectionSetOperation`).val();
        const timestep = $(`#selection${group} .selectionTimestep`).val();
        const degree = parseInt($(`#selection${group} .degreeSelection`).val());
        const sets = []
        $(`#selection${group} .selectionSets input:checked`).each((i, checkbox) => {
            sets.push($(checkbox).val());
        });
        visObject.updateQuery(group, operator, sets, timestep, degree);
    }

    function resetSelection(group) {
        $(`#selection${group} input:checked`).prop('checked', false);
        $(`#selection${group} select`).prop("selectedIndex", 0);
    }

    return {

        init: function () {
            $(`#selectionAB .groupLabel`).removeClass("activeA");
            $(`#selectionAB .groupLabel`).removeClass("activeA");
            initGroupSelection("Details");
            initGroupSelection("A");
            initGroupSelection("B");
            
        },

        select: function (operator, sets, timestep, degree) {
            var group = "A";
            if($('#radioA').is(':checked'))
                group = "A";
            else if($('#radioB').is(':checked'))
            {
                group = "B";
            }
            
            $(`#selection${group} .edgeSelectionText`).attr("style", "display:none");
            $(`#selection${group} .selectionForm`).attr("style", "display:inline");

            clearGroupSelection(group);
            addGroupSelection(group);
            $(`#selection${group} .selectionSetOperation`).val(operator);
            $(`#selection${group} .selectionTimestep`).val(timestep);
            $(`#selection${group} .selectionSets input`).each((i, checkbox) => {
                checkbox.checked = sets.indexOf($(checkbox).val()) >= 0;
            });
            $(`#selection${group} .degreeSelection`).val(degree);
            if(operator == "k-set intersections")
            {
                $(`#selection${group} .selectionSets`).attr("style","display:none");
                $(`#selection${group} .degreeSelection`).attr("style","display:inline");
                $(`#selection${group} .conjunction`).text(", where k = ");

            }
            else
            {
                $(`#selection${group} .selectionSets`).attr("style","display:inline");
                $(`#selection${group} .degreeSelection`).attr("style","display:none");
                $(`#selection${group} .conjunction`).text(" of ");

            }
            updateQuery(group);
        },

        selectEdge: function (stmt, objects){
            var group = "A";
            if($('#radioA').is(':checked'))
                group = "A";
            else if($('#radioB').is(':checked'))
            {
                group = "B";
            }
            clearGroupSelection(group);
            addGroupSelection(group);
            var container = $(`#selection${group} .edgeSelectionText`).empty();
            container.attr("style", "display:inline");
            d3.select(`#selection${group} .selectionForm`).attr("style", "display:none");
            // container.text(stmt);
            $('<span>&ndash; '+stmt+'</span>').appendTo(container);

            visObject.updateEdgeQuery(group, objects);
        },

        drawGroupSelectionStats: function(countAB, countA, countB)
        {
            if("A" in window.selectedGroups && "B" in window.selectedGroups)
            {
                $(`#selectionAB .groupAB`).text("Group A+B: # "+countAB);
                $("#countAB").text(": "+countAB);
            }
            if("A" in window.selectedGroups)
            {
                $(`#selectionA .groupA`).text("Group A: # "+countA);
                $("#countA").text(": "+countA);

            }
            if("B" in window.selectedGroups)
            {
                $(`#selectionB .groupB`).text("Group B: # "+countB);
                $("#countB").text(": "+countB);

            }
        }

    }

}();