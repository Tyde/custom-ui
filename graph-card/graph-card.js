function getScript(e,t){var n=document.getElementsByTagName("head")[0],r=!1,i=document.createElement("script");i.src=e,i.onload=i.onreadystatechange=function(){!r&&(!this.readyState||this.readyState==="loaded"||this.readyState==="complete")&&(r=!0,typeof t=="function"&&t())},n.appendChild(i)};

class GraphCard extends HTMLElement {

    set hass(hass) {
        this._hass = hass;
        if (!this.content) {
          const card = document.createElement('ha-card');
          
          this.content = document.createElement('div');
          
          this.content.innerHTML = ''
          
          const graphContent = document.createElement('div');
          graphContent.className = 'card';
          graphContent.style.height = this.graph_height + 'px';
          graphContent.style.padding = '0px 16px 16px 16px';
          
          this.content.appendChild(graphContent)
          card.appendChild(this.content);
          this.appendChild(card);
          this.initGraph(graphContent);
        }
    }

    initGraph(element) {
        var loading_options = {text: 'Lädt...'};
    

        var callback = function(){
            this.graph = echarts.init(element);
        	this.graph.showLoading('default', loading_options);
        	console.log("ECharts loaded: "+this.title);
        	console.log(this.graph)
        	window.onresize = function(event) {
		        this.graph.resize();
            };
            
            this.getHistory();
        }.bind(this)
        //var cbF = callback.bind(this)
        getScript("/local/custom-lovelace/graph-card/echarts.js", callback);
    
        this.initial_options = {
        	tooltip : {
                trigger: 'axis',
                axisPointer: {
                    type: 'shadow',
                    label: {
                        show: true
                    }
                }
            },
            title: {
                text: this.title
            },
            calculable : true,
            grid: {
                top: '12%',
                left: '1%',
                right: '1%',
                bottom: '20%',
                containLabel: true
            },
            xAxis: [
                {
                    type : 'time',
                }
            ],
            yAxis: [
                {
                    type : 'value',
                    min : 'dataMin'
                }
            ],
            dataZoom: [
                {
                    type: 'slider',
                    show: true,
                    start: this.zoom,
                    end: 100,
                    bottom: '10%'
                },
                {
                    type: 'inside',
                    start: 0,
                    end: 100
                }
            ],
        };
    	
        /* These settings should not affect the updates and reset the zoom on each update. */
        this.update_options = {
            xAxis: [
                {
                    type : 'time',
                }
            ],
            series : []
        };

        this.legend = [];
        for (const entity of this.entities) {
            this.update_options.series.push({
                	smooth: entity.smooth || false,
                    name: entity.name || '',
                    type: entity.type || 'line',
                    areaStyle: entity.areaStyle || null,
                    color: entity.color || null,
                    data: null
                });
        }


    	
    }

    getHistory(update) {
    	var startTime;
    	if (update) {
            startTime = this.lastEndTime;
    	} else {
            startTime = new Date();
            startTime.setHours(startTime.getHours() - this.hoursToShow);
    	}
        var endTime = new Date();
        this.lastEndTime = endTime;
        const filter = startTime.toISOString() + '?end_time=' + endTime.toISOString() + '&filter_entity_id=' + this.entity_ids.join(',');

        const prom = this._hass.callApi('GET', 'history/period/' + filter).then(
          stateHistory => {
              this.formatData(stateHistory, update);
              //console.log(stateHistory);
          },
          () => null
        );
    }
    
    formatData(stateHistories, update) {
        var allData = [];
        
        for (const stateHistory of stateHistories)
		{
            var data = [];
            var entity_id = '';
            var friendly_name = '';
            for (const state of stateHistory)
    		{
                if (entity_id === '') {
                    entity_id = state.entity_id;
                }
                var d = new Date(state.last_changed);
                var state_value = state.state
                friendly_name = state.attributes.friendly_name;
                
                if (entity_id.startsWith("climate")) {
                    state_value = state.attributes.current_temperature
                    var d = new Date(state.last_updated);
                }
                data.push({
                    name: d.toString(),
                    value: [
                        [d.getFullYear(), d.getMonth() + 1, d.getDate()].join('/') + 'T' + d.toLocaleTimeString(),
                        state_value
                    ]
                }); 
                
                
    		}
    		var index = this.entity_ids.indexOf(entity_id);
    		allData[index] = data;
    		this.update_options.series[index].name = friendly_name;
    		this.legend[index] = friendly_name;
		}
        
        if (!update) {
            this.drawGraph(allData);
        } else {
            this.updateGraph(allData);
        }
    }
    
    updateGraph(allData) {
		 
	    /* Delta update. */
	    var i = 0;
	    for (const data of allData) {
    		this.update_options.series[i].data = this.update_options.series[i].data.concat(data);
	        i++;
	    }
		this.graph.setOption(this.update_options);
    }
    
    drawGraph(allData) {
        console.log(this)
        this.graph.hideLoading();
        this.initial_options.legend = {
                show : true,
                data : this.legend,
                type : 'scroll',
                bottom: 'bottom'
        };
	    this.graph.setOption(this.initial_options);
        
        //* Different set of options, to prevent the dataZoom being reset on each update. */
	    var i = 0;
	    for (const data of allData) {
	        this.update_options.series[i].data = data;
	        i++;
	    }


		this.graph.setOption(this.update_options);
		
		var _this = this;
		
		/* Update graph data from now on. */
		setInterval(function () {
            _this.getHistory(true);
		}, this.update_interval * 1000);
        
    }
    
  setConfig(config) {
    this._config = config;
    this.title = config.title || '';
    this.hoursToShow = config.hours_to_show || 24;
    this.update_interval = config.update_interval || 30;
    this.graph_height = config.graph_height || 300;
    this.zoom = config.zoom || 0;

    this.entities = [];
    this.entity_ids = [];
    
    for (const entity of config.entities) {
      if (typeof entity == 'string') {
          this.entities.push({entity: entity});
          this.entity_ids.push(entity);
      } else {
          this.entities.push(entity);
          this.entity_ids.push(entity.entity);
      }
    }

  }
    
  getCardSize() {
    return 4;
  }
}

customElements.define('graph-card', GraphCard);
