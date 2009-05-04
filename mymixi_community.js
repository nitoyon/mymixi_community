function bindParams(obj, params){
    var ret = {};
    for (var name in params){
	ret[obj[name]] = params[name];
    }
    return ret;
}

function addRequest(req, type, id, params, key){
    if (typeof(id) != "string")
	id = opensocial.newIdSpec(bindParams(opensocial.IdSpec.Field, id));

    var r;
    switch(type){
    case "people":
	r = req.newFetchPeopleRequest(id,
				      bindParams(opensocial.DataRequest.PeopleRequestFields, params));
	break;
    case "person":
	r = req.newFetchPersonRequest(id,
				      bindParams(opensocial.DataRequest.PeopleRequestFields, params));
	break;
    case "community":
	r = mixi.newFetchCommunityRequest(id, null);
	break;
    case "fetch_person_data":
	r = req.newFetchPersonAppDataRequest(id, params);
	break;
    case "update_person_data":
	r = req.newUpdatePersonAppDataRequest(id, params.key, params.value);
	break;
    default:
	throw new Error("not implemented");
    }

    req.add(r, key);
}

var PERSONS = {};
var COMMUNITIES = {};
var RANKING = [];


Deferred.define();
window.onload = function(){
    get_friends().
	next(friends_handler).
	next(function(){
	    return load_rank().
		error(calc_rank).
		next(output_html);
	}).
	error(console.log);
}

function calc_rank(){
    next(get_communities).
	next(summary).
	next(output_html).
	error(function(e){console.log(e);});
}



function load_rank(){
    var d = new Deferred();

    var request = opensocial.newDataRequest();
    addRequest(request, "fetch_person_data", opensocial.IdSpec.PersonId.OWNER, "rank", "rank_fetch");
    request.send(function(response){
        var data  = response.get("rank_fetch").getData();
	for(var id in data){
	    var dat = gadgets.util.unescapeString(data[id]["rank"]);
	    RANKING = gadgets.json.parse(dat);
	    if (RANKING != null){
		d.call(RANKING);
		return;
	    }
	}

	d.fail();
    });
    return d;
}

function get_friends(){
    var request = opensocial.newDataRequest();
    addRequest(request, "people", {
	USER_ID: "OWNER",
	GROUP_ID: "FRIENDS"
    }, { MAX: 1000}, "friends_data");

    var d = new Deferred();
    request.send(function(r){d.call(r);});
    return d;
}

function friends_handler(response){
    var item = response.get("friends_data");
    if (item.hadError()) {
	throw Error("failed");
    }

    item.getData().each(function(person){
	PERSONS[person.getId()] = {
	    name: person.getDisplayName(),
	    id: person.getId(),
	    thumbnail: person.getField(opensocial.Person.Field.THUMBNAIL_URL)
	};
    });
}

function get_communities(){
    var d = new Deferred();
    var elm = document.getElementById("output");

    var ids = [];
    for(var id in PERSONS) ids.push(id);
    var length = ids.length;

    function req(){
	var request = opensocial.newDataRequest();
	elm.innerHTML = (Math.round(1000 * (length - ids.length) / length) / 10) + "%";
	id = ids.shift();

	var person = PERSONS[id];
	addRequest(request, "community",
		   { USER_ID: id }, {}, "com");

	request.send(function(response){
	    parse_community(id, response);

	    if (ids.length == 0){
		elm.innerHTML = "100%";
		d.call();
	    } else {
		req();
	    }
	});
    }

    req();
    return d;
}

function parse_community(id, response){
    var item = response.get("com");
    if (item.hadError()) {
	return;
    }

    item.getData().each(function(community){
	var thumb = community.getField(mixi.Community.Field.THUMBNAIL_URL);
	var comm_id = community.getId().replace(/.*\//, '');
	if (!COMMUNITIES[comm_id]){
	    COMMUNITIES[comm_id] = {
		id: comm_id,
		name: community.getName(),
		thumbnail: thumb,
		people: []
	    };
	}
	COMMUNITIES[comm_id].people.push(id);
    });
}

function summary(){
    console.log(PERSONS);
    console.log(COMMUNITIES);

    var comms = [];
    for (var id in COMMUNITIES) comms.push(id);
    comms.sort(function(a, b){
	var alen = COMMUNITIES[a].people.length;
	var blen = COMMUNITIES[b].people.length;
	return alen < blen ? 1 : alen > blen ? -1 : 0;
    });

    var html = "";
    RANKING = [];
    for (var i = 0; i < Math.min(comms.length, 100); i++){
	var comm = COMMUNITIES[comms[i]];
	RANKING.push({
	    id: comm.id,
	    name: escape(comm.name),
	    thumb: comm.thumbnail,
	    people: comm.people
	});
    }

    var json = gadgets.json.stringify(RANKING);
    var request = opensocial.newDataRequest();
    addRequest(request,
	       "update_person_data",
	       opensocial.IdSpec.PersonId.VIEWER,
	       {key: "rank", value: json},
               "rank");
    request.send();
}

function output_html(){
    var html = "";
    for (var i = 0; i < RANKING.length; i++){
	var comm = RANKING[i];
	html += "<p><img src=\"" + comm.thumb + "\">"
            + "<a href=\"http://mixi.jp/view_community.pl?id=" + comm.id + "\" target=\"_top\">"
	    + unescape(comm.name) + "</a> (" + comm.people.length + ") ";

	for (var j in comm.people){
	    var id = comm.people[j];
	    html += "<img src=\"" + PERSONS[id].thumbnail + "\" alt=\"" + PERSONS[id].name + "\">";
	}
	html += "</p>";
    }
    document.getElementById("output").innerHTML = html;
    gadgets.window.adjustHeight();
    console.log(PERSONS);
}