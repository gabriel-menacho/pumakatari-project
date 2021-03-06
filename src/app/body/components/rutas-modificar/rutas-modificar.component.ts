import { Component, ViewChild, OnInit, ElementRef } from "@angular/core";
import { DrawingManager } from "@ngui/map";
import { DbService } from "../../../services/db.service";
import { FirebaseListObservable, FirebaseObjectObservable } from "angularfire2";
import { AF } from "../../../../providers/af";
import { MessageService } from "../../../services/message.service";
import { Parada } from "../../../models/parada";

@Component({
  selector: "app-rutas-modificar",
  templateUrl: "./rutas-modificar.component.html"
})
export class RutasModificarComponent implements OnInit {
  public error: any;
  selectedOverlay: any;
  @ViewChild(DrawingManager) drawingManager: DrawingManager;
  stops$: FirebaseListObservable<any[]>;
  routes$: FirebaseListObservable<any[]>;
  public positions: any = [];
  public selectedPositions: any = [];
  public icon = "assets/images/marker.png";
  public center: any = "-16.500393,-68.123077";
  public zoom: any = 14;
  public selectedRoute: any = null;
  public overlays: any = [];
  public map: any;
  public firstStop = false;

  constructor(
    private msgService: MessageService,
    private db: DbService,
    private elRef: ElementRef,
    public afService: AF
  ) {}

  ngOnInit() {
    this.db.getRoutesList().subscribe(routes$ => {
      if (!routes$) {
        this.routes$ = this.db.loadRoutesList();
      } else {
        this.routes$ = routes$;
      }
    });

    this.db.getStopsList().subscribe(stops$ => {
      if (!stops$) {
        this.stops$ = this.db.loadStopsList();
        this.stops$.subscribe(stops => {
          this.initPositions(stops);
        });
      } else {
        this.stops$ = stops$;
        this.stops$.subscribe(stops => {
          this.initPositions(stops);
        });
      }
    });

    this.drawingManager["initialized$"].subscribe(dm => {
      google.maps.event.addListener(dm, "overlaycomplete", event => {
        if (event.type !== google.maps.drawing.OverlayType.MARKER) {
          dm.setDrawingMode(null);
          event.overlay.overlayNumber = this.overlays.length;
          this.overlays.push(event.overlay);
          google.maps.event.addListener(event.overlay, "click", e => {
            this.selectedOverlay = event.overlay.overlayNumber;
            this.overlays[this.selectedOverlay].setEditable(true);
          });
        }
      });
    });
  }

  initPositions(stops) {
    stops.forEach(stop => {
      const curStop = new Parada(stop);
      this.positions.push(curStop.getPositionObject());
    });
  }

  deleteAllTraces() {
    const overlaysLength = this.overlays.length;
    for (let i = 0; i < overlaysLength; i += 1) {
      this.deleteTrace(0);
    }
  }

  deleteTrace(traceNumber) {
    let i;
    this.overlays[traceNumber].setMap(null);
    this.overlays.splice(traceNumber, 1);
    for (i = 0; i < this.overlays.length; i += 1) {
      this.overlays[i].overlayNumber = i;
    }
  }

  updateRoute(event, routeKey) {
    let i;
    let j;
    let traces;
    let polyline;
    this.deleteAllTraces();
    this.firstStop = false;
    this.selectedPositions = [];
    this.overlays = [];
    const options = this.elRef.nativeElement.firstChild.childNodes[3]
      .childNodes[1].childNodes[3].childNodes[1].options;
    for (i = 0; i < options.length; i += 1) {
      options[i].selected = false;
      options[i].classList.remove("selected");
    }
    this.db.getRoute(routeKey).subscribe(route => {
      this.selectedRoute = {
        name: route.nombre,
        $key: route.$key
      };
      if (route.trazos) {
        for (i = 0; i < route.trazos.length; i += 1) {
          traces = [];
          for (j = 0; j < route.trazos[i].length; j += 1) {
            traces.push(route.trazos[i][j]);
          }
          polyline = new google.maps.Polyline({
            path: traces,
            editable: true
          });
          polyline.overlayNumber = i;
          polyline.setMap(this.map);
          this.overlays.push(polyline);
        }
      }
      if (route.paradas) {
        this.stops$.forEach(stops => {
          stops.map(stop => {
            if (this.isStopinRoute(stop.$key, route.paradas)) {
              this.selectedPositions.push({
                latLng: [stop.lat, stop.lng],
                name: stop.nombre,
                $key: stop.$key
              });
              if (!this.firstStop) {
                this.firstStop = true;
                this.center = "" + stop.lat + "," + stop.lng;
              }
              for (i = 0; i < options.length; i += 1) {
                if (options[i].value === stop.$key) {
                  options[i].selected = true;
                  options[i].classList.add("selected");
                  break;
                }
              }
            }
          });
        });
      }
    });
  }

  onKeyUp(event) {
    if (this.selectedRoute) {
      this.selectedRoute.name = event.target.value;
    } else {
      event.target.value = "";
    }
  }

  toggleStop(event, stopKey) {
    const options = event.target.options;
    const length = options.length;
    let classList;
    const selectedCls = "selected";
    let isSelected;
    if (!this.selectedRoute) {
      alert("Seleccione una ruta antes de modificar las paradas");
      return;
    }
    for (let i = 0; i < length; i += 1) {
      if (options[i].value === stopKey) {
        classList = options[i].classList;
        isSelected = options[i].className.indexOf(selectedCls) > -1;
        classList[isSelected ? "remove" : "add"](selectedCls);
        options[i].selected = !isSelected;
        this.toggleStopSelection(stopKey, !isSelected);
      }
    }
    event.target.value = undefined;
  }

  toggleStopSelection(stopKey, addStop) {
    let i;
    let stop;
    for (i = 0; i < this.positions.length; i += 1) {
      if (this.positions[i].$key === stopKey) {
        stop = this.positions[i];
        break;
      }
    }
    if (addStop) {
      this.selectedPositions.push(stop);
      return;
    }
    for (i = 0; i < this.selectedPositions.length; i += 1) {
      if (this.selectedPositions[i].$key === stopKey) {
        this.selectedPositions.splice(i, 1);
        return;
      }
    }
  }

  modifyRoute(event) {
    this.afService
      .modifyRoute(this.overlays, this.selectedRoute, this.selectedPositions)
      .then(() => {
        this.resetValues();
        this.msgService.showSuccessMessage("Ruta modificada exitosamente!");
      })
      .catch((error: any) => {
        if (error) {
          this.error = error;
          console.error(this.error);
          this.msgService.showErrorMessage("Error al modificar la ruta");
        }
      });
  }

  resetValues() {
    //TODO
  }

  onMapReady(event) {
    this.map = event;
  }

  isStopinRoute(stopKey, paradas) {
    let i;
    for (i = 0; i < paradas.length; i += 1) {
      if (stopKey === paradas[i]) {
        return true;
      }
    }
    return false;
  }

  AfterViewInit() {
    const classList = this.elRef.nativeElement.parentElement.parentElement
      .parentElement.parentElement.parentElement.parentElement.classList;
    classList.remove("other-tab");
    classList.add("inicio-tab");
  }

  clicked(event) {
    const marker = event.target;
    marker.nguiMapComponent.openInfoWindow("iw", marker, {
      stopName: marker.getTitle()
    });
  }
}
