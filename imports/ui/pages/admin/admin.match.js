
import "./admin.match.html";
import Participants from "/imports/collections/participants";
import Accommodations from '/imports/collections/accommodations';
import "/imports/ui/components/loader/loader";

import jwt from 'jsonwebtoken';
import _ from "lodash";
import moment from "moment";
import { flatten }from 'flat';
import {deepFlatten, deepPick, deepFind} from '/lib/js/utilities'
import { debug, debuglog } from "util";
import  Papa from 'papaparse';
import Downloadjs from "downloadjs";

var currentstep=0;
var arrComodations;
var mapReady;

let raven = require('raven');
let client = new raven.Client('https://7b01834070004a4a91b5a7ed14c0b411:79de4d1bd9f24d1a93b78b18750afb54@sentry.io/126769', {
  environment: Meteor.settings.public.environment,
  server_name: 'snowdays',
  tags: {section: 'API'}
});
// catches all exceptions on the server
raven.patchGlobal(client);

client.on('logged', function () {
    console.log('Exception handled and sent to Sentry.io');
});

client.on('error', function (e) {
    // The event contains information about the failure:
    //   e.reason -- raw response body
    //   e.statusCode -- response status code
    //   e.response -- raw http response object

    console.log('Couldn\'t connect to Sentry.io');
});



const ParticipantsIndices = {
  firstName:"heather",
  lastName:"heather",
  'info.accommodation': "GALILEI",
  'info.buszone':"1",
  university:"WHU"
}

Template.AdminMatchSection.onCreated(function () {
  Session.set('subtab', 'BusSection');
  GoogleMaps.ready('map', function(map) {
    mapReady=map;
    //loadMap();
 });
  Meteor.startup(function () {
    GoogleMaps.load({ v: '3', key: 'AIzaSyAPuyAsNeq6kyq0rXEjBDRfzHQYlQ2vrHw'});
  });
  
});

Template.BusSection.onCreated(function() {
  GoogleMaps.ready('map', function(map) {
    mapReady=map;
    //loadMap();
 });
  Meteor.startup(function () {
    GoogleMaps.load({ v: '3', key: 'AIzaSyAPuyAsNeq6kyq0rXEjBDRfzHQYlQ2vrHw'});
  });
})

Template.BusSection.helpers({
  mapOptions: function() {
    var myLatLng = {lat: 46.49502, lng:  11.33952};
    
    if (GoogleMaps.loaded()) {
      return {
        center: myLatLng,
        zoom: 14
      };
    }
  },
})

Template.AdminMatchSection.onRendered(function () {
});

Template.AdminMatchSection.helpers({
    showTheMapHelper:function(){
        return Session.get('showMap');
    },
    subtab: function () {
      return Session.get('subtab');
    },
    isActive: function (section) {
      let subtab = Session.get('subtab');
      if (_.isEqual(subtab, section)) return 'sn-menu-item-active'
    },
    mapOptions: function() {
      var myLatLng = {lat: 46.49502, lng:  11.33952};
      
      if (GoogleMaps.loaded()) {
        return {
          center: myLatLng,
          zoom: 14
        };
      }
    },
})


Template.AdminMatchSection.events({

    'click .sn-menu-item': (event, template) => {
      switch (event.currentTarget.id) {
        case 'bus':
         Session.set('subtab', 'BusSection');
        break;
        case 'accommodation':
          Session.set('subtab', 'AccommodationSection');
        break;
        case 'result':
          Session.set('subtab', 'ResultSection');
        break;
      }
    },
    'click #matchingBus': function (event, template) {
      
      Meteor.subscribe("accommodations.all");
      //console.log(AccommodationsT.find({}, {fields: {'_id':1}}).count());

      arrComodations=Accommodations.find({}, {fields: {'_id':1}}).fetch();

      evalNextAccomodation();

    },
});


Template.ResultSection.onRendered({
});

Template.ResultSection.onCreated(function () {  

  let template = Template.instance();
  template.flattenedFields = new ReactiveVar(ParticipantsIndices);
  
  template.collection = new ReactiveVar({
      name: 'Participants',
      instance: Participants,
      flattened: template.flattenedFields.get(),
      searchQuery: '',
      filters: []
  });
  let collection = template.collection.get();
  Meteor.subscribe("participants", () => {
       console.log('load data', Participants.find().fetch());
      setTimeout(() => {
        generateTableForDB(template,'#result_table');
      }, 300);
  });

});

Template.ResultSection.events({
  'click #download_csv_DB': function(event,template) {
    let collection = template.collection.get();
    let filename = '';
    let download = '';
    swal.setDefaults({
        confirmButtonText: 'Next &rarr;',
        showCancelButton: true,
        allowOutsideClick: false,
        progressSteps: ['1','2']
    });

    let steps = [
      {
        title: 'Download ...',
        input: 'radio',
        inputOptions: {
            'all': ' All current collection',
            'results': ' Results shown only'
        },
        confirmButtonColor: '#008eff',
        inputValidator: function (result) {
            return new Promise(function (resolve, reject) {
                if (result) {
                    download = result;
                    resolve()
                } else {
                    reject('You need to select something!')
                }
            })
        }
    },
    {
        title: 'Please give the file a name',
        input: 'text',
        showCancelButton: true,
        confirmButtonColor: '#008eff',
        confirmButtonText: 'Download',
        inputValidator: function (result) {
            return new Promise(function (resolve, reject) {
                if (result) {
                    filename = result;
                    resolve()
                } else {
                    reject('You need to write something!')
                }
            })
        },
        preConfirm: function () {
            return new Promise(function (resolve) {
                $.when(setSubscription(collection.filters, collection.searchQuery, collection.flattened)).done(function (options) {
                    options['filename'] = filename;
                    options['download'] = download;
                    let encoded = jwt.sign(options, 'secret', {expiresIn: 60});
                    Meteor.setTimeout(function () {
                        Router.go('/csv/' + encoded);
                    }, 300)
                })
            })
        }
    }
    ];

    swal.queue(steps).then(function () {
        console.log('steps');
        swal.resetDefaults()
    })
  }
})

Template.AccommodationSection.onCreated(function() {
  Meteor.subscribe("participants");
  var participants = Participants.find().fetch();
  Session.set('isWGReady', false);
  Session.set('displayMatchingList',false);
  Session.set('isLoading', false);
  Session.set('matchingInitialResults', []);
  Session.set('matchingWGResults', []);
  Session.set('unMatchedResults', []);
  Session.set('participants', participants);
});

Template.AccommodationSection.helpers({
  isCSVReady: function() {
    return Session.get('isWGReady');
  },
  displayMatchingResults:function () {
    return Session.get('unMatchedResults')
  },
  displayMatchingListHelper: function() {
    return Session.get('displayMatchingList');
  },
  isLoadingHelper: function(){
    return Session.get('isLoading');
  },
});
Template.AccommodationSection.events({
  'click #matchingParticipants': function(event,template) {
    const tableName = '#MatchingParticipants_table';
    Session.set('isLoading',true);
    Meteor.call('matching_algorithm',  function (error, results) {
      if (error) {
        swal('Error', error.message, 'error');
        Session.set('isLoading',false);
      }
      else {
        generateTable(results.initial.content, '#MatchingParticipants_table');
        generateTable(results.second.content, '#MatchingWG_table');
        Session.set('matchingInitialResults', results.initial.content);
        Session.set('matchingWGResults', results.second.content);
        Session.set('isWGReady', true);
      }
    });
  },
  'click #download_csv_initial': function (event,template) {
    let collection = Session.get('matchingInitialResults');
    displayFileNameDialog(collection);
  },
  'click #download_csv_second': function (event,template) {
    let collection = Session.get('matchingWGResults');
    displayFileNameDialog(collection);
  },
  'click #saveResult': function(event,template) {
     let s = Participants.find({_id : 1021}).fetch();
     s;
    console.log(Participants.find().fetch());
     selectdSaveResult();
  }
})

//Function

function selectdSaveResult() {
  swal.setDefaults({
    confirmButtonText: 'Next &rarr;',
    showCancelButton: true,
    allowOutsideClick: false,
    progressSteps: ['1','2']
});

let steps = [
  {
    title: 'Please select the result to download ...',
    input: 'select',
    inputOptions: {
      'all': 'All',
      '1': '1st iteration',
      '2': '2nd iteration'
    },
    inputPlaceholder: 'Select results',
    showCancelButton: true,
    inputValidator: (value) => {
      return new Promise((resolve) => {
        if (value) {
          selectedResult = value
          resolve()
        } else {
          resolve('You need to select something')
        }
      })
    }
  },
  {
      title: 'Do you confirm to update Participants',
      type: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#008eff',
      confirmButtonText: 'Confirm',
      inputValidator: function (result) {
          return new Promise(function (resolve, reject) {
              
          })
      },
      preConfirm: function () {
        return new Promise(function (resolve) {
          results = {}
          if(selectedResult === '1') {
            results = JSON.parse(Session.get('matchingInitialResults')).data;
          } else if(selectedResult === '2'){
            results = JSON.parse(Session.get('matchingWGResults')).data;
          } else {
            results = JSON.parse(Session.get('matchingInitialResults')).data.concat(JSON.parse(Session.get('matchingWGResults')).data);
          }
          console.log('results', results);
          let uniqueResults = _.uniqBy(results,'_university_id');
          console.log('uniqueResults',uniqueResults);
          Meteor.setTimeout(function () {
            _.forEach(uniqueResults, function (result, key) {
              let Id = result._university_id.toString();
              let selectedParticipant =  Participants.find({'host': {'id': Id}}).fetch();
              if(selectedParticipant){
                _.forEach(selectedParticipant, function(participant, key) {
                  updatedParticipant = transformParticipant(participant, result);
                  Meteor.call('admin.participants.update', updatedParticipant, function (error, result) {
                    if (error) {
                      swal('Error', error.message, 'error');
                    }
                    else {
                      Session.set('subtab', 'ResultSection');
                    }
                  })
                })
              }
            })
            
            resolve();
          }, 300)
        })
      }
  }
];

swal.queue(steps).then(function () {
    console.log('steps');
    swal.resetDefaults()
});
}

function transformParticipant(original, modification) {
  if(modification._accommondation_details !== 0) {
    if(!original.info) {
      original['info']= {
        'accommodation': modification._accommondation_details.name,
        'buszone': modification._accommondation_details.bus_zone
      }
    }
    else {
      original.info.accommodation  = modification._accommondation_details.name;
      original.info.buszone = modification._accommondation_details.bus_zone;
    }
  }
  return original;
}

function displayFileNameDialog(collection) {
  let filename = '';
  swal.setDefaults({
      confirmButtonText: 'Next &rarr;',
      showCancelButton: true,
      allowOutsideClick: false,
      progressSteps: ['1']
  });

  let steps = [
    {
        title: 'Please give the file a name',
        input: 'text',
        showCancelButton: true,
        confirmButtonColor: '#008eff',
        confirmButtonText: 'Download',
        inputValidator: function (result) {
            return new Promise(function (resolve, reject) {
                if (result) {
                    filename = result;
                    resolve()
                } else {
                    reject('You need to write something!')
                }
            })
        },
        preConfirm: function () {
            return new Promise(function (resolve) {
              let options = {};
                options['fileName'] = filename;
                options['download'] = 'all';
                options['collection'] = collection;
                let encoded = jwt.sign(options, 'secret', {expiresIn: 60});
                Meteor.setTimeout(function () {
                    jsonToCSV(options);
                    resolve();
                }, 300)
            })
        }
    }
  ];

  swal.queue(steps).then(function () {
      console.log('steps');
      swal.resetDefaults()
  });
}

function jsonToCSV(payload) {
  let jsonResult = JSON.parse(payload.collection);
  let flattened = [];
  _.forEach(jsonResult.data, function (match) {
    flattened.push(flatten(match))
  });

  // parse json and get csv
  let csv = Papa.unparse(flattened);
  Downloadjs(csv, payload.fileName.concat('.csv'), "text/csv");
}

function generateTable(collection,tableName) {
  var results = JSON.parse(collection);
  Session.set('unMatchedResults', results.unassigned_data);

  let table = $(tableName);
  let tableHead = table.find('thead');
  let tableBody = table.find('tbody');
  let flattened = {};
  let count = 0;

  // get flattened object
  flattenedResult = flatten(results.data[0]);
  if(tableName == 'MatchingParticipants_table')

  // remove all
  tableHead.children().remove();
  tableBody.children().remove();

  // HEADER
  tableHead.append("<tr>");
  tableHead.append("<th class='animated fadeIn'>#</th>");

  _.forEach(flattenedResult, function (value, key) {
      // get labels from schema schema
      tableHead.append("<th class='animated fadeIn'>" + key + "</th>");
  });
  tableHead.append("</tr>");

  // BODY
  _.forEach(results.data, function (row) {
    if(_.keys(flattenedResult).length === _.keys(flatten(row)).length ){ 
      tableBody.append("<tr class='animated fadeIn'>");

      // count column
      tableBody.append("<th class='animated fadeIn' scope=\"row\">" + ++count + "</th>");

      _.forEach(flattenedResult, function (value, key) {
          let cell = deepFind(row, key);
          tableBody.append("<td class='animated fadeIn'>" + (_.isUndefined(cell) ? '–' : cell) + "</td>");
      });
      tableBody.append("</tr>");
    }
  });
}

function generateTableForDB(template, tableName) {
  let collection = template.collection.get();
  let list = collection.instance.find().fetch();
  let schema = collection.instance.simpleSchema();

  let table = $(tableName);
  let tableHead = table.find('thead');
  let tableBody = table.find('tbody');
  let flattened = {};
  let count = 0;

  // set select value
  $('#collection_select').val('MatchingParticipants');

  // get flattened object
  flattened = collection.flattened;

  // remove all
  tableHead.children().remove();
  tableBody.children().remove();

  // HEADER
  tableHead.append("<tr>");
  tableHead.append("<th class='animated fadeIn'>#</th>");

  _.forEach(flattened, function (value, key) {
      // get labels from schema schema
      tableHead.append("<th class='animated fadeIn'>" + (_.isNull(schema) ? key : schema.label(key)) + "</th>");
  });
  tableHead.append("</tr>");

  // BODY
  _.forEach(list, function (row) {
      tableBody.append("<tr class='animated fadeIn'>");

      // count column
      tableBody.append("<th class='animated fadeIn' scope=\"row\">" + ++count + "</th>");

      _.forEach(flattened, function (value, key) {
          let cell = deepFind(row, key);
          tableBody.append("<td class='animated fadeIn'>" + (_.isUndefined(cell) ? '–' : cell) + "</td>");
      });
      tableBody.append("</tr>");
  });
}
function setSubscription(filters, search, flattened) {
  let query = {};

  _.forEach(filters, function (filter) {
      _.assign(query, filter)
  });

  if (search) {
      query['$or'] = [];

      _.forEach(flattened, function (value, key) {
          // let field = {};
          // field[key] = search;
          // return query['$or'].push(field)
          let field = {};
          field[key] = {$regex: search, $options: "i"};
          return query['$or'].push(field)
      });
  }

  return {
      "query": query,
      "fields": flattened || {}
  }
}

function loadMap()
{
     Meteor.subscribe("accommodations.all");
     Meteor.subscribe("buszones.all");

     var arrComodations=Accommodations.find().fetch();
     var markers= [];
     for (var index = 0; index < arrComodations.length; index++) {
       var accommodation = arrComodations[index];
       var arrlatlng= accommodation.coordinates.split(",");
       var objLatLng = {lat: parseFloat( arrlatlng[0]),lng: parseFloat( arrlatlng[1])};
       markers=getMultipleMarkersCant(objLatLng,accommodation.capacity ,markers); 
     }
     var markerCluster = new MarkerClusterer(mapReady.instance, markers,
      {imagePath: 'https://developers.google.com/maps/documentation/javascript/examples/markerclusterer/m'});

      var pinColor = "FE7569";
      var pinImage = new google.maps.MarkerImage("https://chart.googleapis.com/chart?chst=d_map_pin_icon&chld=bus|" + pinColor,
          new google.maps.Size(21, 34),
          new google.maps.Point(0,0),
          new google.maps.Point(10, 34));

      var arrBusZones= BusZones.find().fetch();
      for (var index = 0; index < arrBusZones.length; index++) {
        var bus = arrBusZones[index];
        var objLatLng = {lat: bus.lat ,lng: bus.lng };
        addMarker(objLatLng,mapReady.instance,(index+1).toString(),pinImage);
        var regionCoord=[];
        for (var j = 0; j < arrComodations.length; j++) {
          var accomodation = arrComodations[j];
          if(accomodation.busZone==bus._id)
          {
            var arrlatlng= accommodation.coordinates.split(",");
            var objLatLng = {lat: parseFloat( arrlatlng[0]),lng: parseFloat( arrlatlng[1])};
            regionCoord.push(objLatLng);
          }
          
        }
        addPolygon(mapReady.instance,regionCoord,'#FFCC00',0.8, 2,'#FFCC00', 0.5);
        
      }

}

function evalNextAccomodation()
{
  var co = arrComodations[currentstep]._id._str;
  var clientResult = Meteor.apply('evaluateAccomodation',
    [arrComodations[currentstep]._id._str]
    , {returnStubValue: true},

      function(err, evalResult) {
        currentstep=currentstep+1;
        setProgress(currentstep,arrComodations.length );
        if(currentstep<arrComodations.length)
        {
          evalNextAccomodation();
        }else
        {

          loadMap();
        }
        
        //console.log("result");
        //Here have to update the progress of the bar
    }
    );
}
function setProgress(step, total)
{
  var elem = document.getElementById("myBar");   
  var width = (step/total)*100;
  
  if(width>=100){
    width = 100;
    Session.set('showMap',true);
  }         
    
  elem.style.width = width + '%';
  elem.innerHTML = (width.toPrecision(3) * 1  + '%') ;
    

    
  
}
function move(num, tot){
  var elem = document.getElementById("myBar");   
  var width = 0;
  //var id = setInterval(frame, 100);
  for(i=0; i < tot; i++){
    //alert(i) 
    Meteor.call('dummyAcc', i, function(error, result){
      if(error){
          console.log(error);
      } else {
        if (result){
           //alert("I'm in!")
        if (width >= 100) {
          clearInterval(id);
          //alert("Hi I'm an alert!")
          
          } else {
          width+=num; 
          if(width>=100){
            width = 100;
            Session.set('showMap',true);
          }         
            
          elem.style.width = width + '%';
          elem.innerHTML = (width.toPrecision(3) * 1  + '%') ;
            
            
          }
        }
        
      }
  });

    
  }
}
function getMultipleMarkersCant(LatLng, cant,markers)  
{
  

  for (var index = 0; index < cant; index++) {
    var marker = new google.maps.Marker({
      position: LatLng,
      label: '1'
    });
    markers.push(marker);
    
  }
  return markers;
}
function addMarker(LatLng,gmap,title, icon)
{
  
  var marker = new google.maps.Marker({
    position: LatLng,
    map: gmap,
    icon: icon,
    title: title
  });
}
function addPolygon (gmap, arrCoords, strokeColor, strokeOpacity, strokeWeight, fillColor, fillOpacity)
{
  
  // Construct the polygon.
  var bermudaTriangle = new google.maps.Polygon({
    paths: arrCoords,
    strokeColor: strokeColor ,
    strokeOpacity: strokeOpacity,
    strokeWeight: strokeWeight,
    fillColor: fillColor,
    fillOpacity: fillOpacity
  });
  bermudaTriangle.setMap(gmap);

}