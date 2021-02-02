import { useState, useRef } from "react";
import { useApi } from "@grouparoo/ui-components/hooks/useApi";
import { Typeahead } from "react-bootstrap-typeahead";
import { Row, Col, Form, Badge, Button, Table, Alert } from "react-bootstrap";
import ProfilePreview from "@grouparoo/ui-components/components/destination/profilePreview";
import Head from "next/head";
import { useRouter } from "next/router";
import DestinationTabs from "@grouparoo/ui-components/components/tabs/destination";
import LoadingButton from "@grouparoo/ui-components/components/loadingButton";
import StateBadge from "@grouparoo/ui-components/components/badges/stateBadge";
import LockedBadge from "@grouparoo/ui-components/components/badges/lockedBadge";
import PageHeader from "@grouparoo/ui-components/components/pageHeader";
import { Models, Actions } from "@grouparoo/ui-components/utils/apiData";
import { ErrorHandler } from "@grouparoo/ui-components/utils/errorHandler";
import { SuccessHandler } from "@grouparoo/ui-components/utils/successHandler";

export default function Page(props) {
  const {
    errorHandler,
    successHandler,
    properties,
    mappingOptions,
    destinationTypeConversions,
    groups,
    exportArrayProperties,
    hydrationError,
  }: {
    errorHandler: ErrorHandler;
    successHandler: SuccessHandler;
    hydrationError: Error;
    properties: Models.PropertyType[];
    groups: Models.GroupType[];
    mappingOptions: Actions.DestinationMappingOptions["options"];
    destinationTypeConversions: Actions.DestinationMappingOptions["destinationTypeConversions"];
    exportArrayProperties: Actions.DestinationExportArrayProperties["exportArrayProperties"];
  } = props;
  const { execApi } = useApi(props, errorHandler);
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [trackedGroupGuid, setTrackedGroupGuid] = useState(
    props.trackedGroupGuid || "_none"
  );
  const [destination, setDestination] = useState<Models.DestinationType>(
    props.destination
  );
  const [
    displayedDestinationProperties,
    setDisplayedDestinationProperties,
  ] = useState<string[]>([]);
  const displayedDestinationPropertiesAutocomleteRef = useRef(null);
  const taggedGroupRef = useRef(null);
  const [unlockedProperties, setUnlockedProperties] = useState({});
  const [unlockedGroups, setUnlockedGroups] = useState<string[]>([]);
  const { guid } = router.query;

  if (hydrationError) errorHandler.set({ error: hydrationError });

  const update = async (event) => {
    event.preventDefault();
    setLoading(true);

    // handle destination group membership & mapping
    const filteredMapping = {};
    for (const k in destination.mapping) {
      if (destination.mapping[k] && destination.mapping[k] !== "") {
        filteredMapping[k] = destination.mapping[k];
      }
    }
    const destinationGroupMembershipsObject = {};
    destination.destinationGroupMemberships.forEach(
      (dgm) =>
        (destinationGroupMembershipsObject[dgm.groupGuid] = dgm.remoteKey)
    );
    await execApi("put", `/destination/${guid}`, {
      mapping: filteredMapping,
      destinationGroupMemberships: destinationGroupMembershipsObject,
    });

    // update group being tracked after the edit
    if (
      trackedGroupGuid !== props.trackedGroupGuid &&
      trackedGroupGuid.match(/^grp_/)
    ) {
      await execApi("post", `/destination/${guid}/track`, {
        groupGuid: trackedGroupGuid,
      });
    } else if (
      trackedGroupGuid !== props.trackedGroupGuid &&
      trackedGroupGuid === "_none"
    ) {
      await execApi("post", `/destination/${guid}/untrack`);
    } else {
      // trigger a full export
      await execApi("post", `/destination/${guid}/export`, { force: true });
    }

    setLoading(false);
    successHandler.set({
      message: "Destination Updated and Profiles Exporting...",
    });
  };

  const remainingPropertiesForKnown = [];
  for (const i in properties) {
    let inUse = false;
    for (const j in mappingOptions?.properties?.required) {
      const opt = mappingOptions.properties.required[j];
      if (destination.mapping[opt.key] === properties[i].key) {
        inUse = true;
      }
    }

    if (!inUse) {
      remainingPropertiesForKnown.push(properties[i]);
    }
  }

  const remainingPropertyKeysForOptional = properties
    .filter(filterRuleForArrayProperties)
    .map((rule) => rule.key);

  mappingOptions?.properties?.required.map((opt) => {
    if (destination.mapping[opt.key]) {
      remainingPropertyKeysForOptional.splice(
        remainingPropertyKeysForOptional.indexOf(destination.mapping[opt.key]),
        1
      );
    }
  });
  mappingOptions?.properties?.known.map((opt) => {
    if (destination.mapping[opt.key]) {
      remainingPropertyKeysForOptional.splice(
        remainingPropertyKeysForOptional.indexOf(destination.mapping[opt.key]),
        1
      );
    }
  });

  const optionalMappingRemoteKeys = Object.keys(destination.mapping).filter(
    (key) => {
      if (
        mappingOptions?.properties?.required.map((opt) => opt.key).includes(key)
      ) {
        return false;
      }
      if (
        mappingOptions?.properties?.known.map((opt) => opt.key).includes(key)
      ) {
        return false;
      }
      return true;
    }
  );

  function updateMapping(key, value, oldKey = null) {
    const _destination = Object.assign({}, destination);
    let destinationMappingKeys = Object.keys(_destination.mapping);
    let insertIndex = destinationMappingKeys.length - 1;

    if (oldKey && value) {
      insertIndex = destinationMappingKeys.indexOf(oldKey);
      destinationMappingKeys.splice(insertIndex, 1, key);
    } else if (oldKey) {
      insertIndex = destinationMappingKeys.indexOf(oldKey);
      destinationMappingKeys.splice(insertIndex, 1);
    } else {
      destinationMappingKeys.push(key);
    }

    _destination.mapping[key] = value;

    const newMapping = {};
    destinationMappingKeys.map((k) => {
      newMapping[k] = _destination.mapping[k];
    });
    _destination.mapping = newMapping;

    if (value === "") {
      const _displayedDestinationProperties = [
        ...displayedDestinationProperties,
      ];

      _displayedDestinationProperties.splice(
        _displayedDestinationProperties.indexOf(oldKey),
        1
      );
      setDisplayedDestinationProperties(_displayedDestinationProperties);
    }

    setDestination(_destination);
  }

  function updateDestinationGroupMembership(
    groupGuid,
    remoteKey,
    oldGroupGuid = null
  ) {
    const _destination = Object.assign({}, destination);
    _destination.destinationGroupMemberships = _destination.destinationGroupMemberships.filter(
      (dgm) => dgm.groupGuid !== oldGroupGuid
    );

    const groupName = groups.filter((g) => g.guid === groupGuid)[0]?.name;

    let found = false;
    for (const i in _destination.destinationGroupMemberships) {
      if (_destination.destinationGroupMemberships[i].groupGuid === groupGuid) {
        _destination.destinationGroupMemberships[i] = {
          groupGuid,
          groupName,
          remoteKey: remoteKey ? remoteKey : groupName,
        };
        found = true;
      }
    }

    if (!found && groupGuid) {
      _destination.destinationGroupMemberships.push({
        groupGuid,
        groupName,
        remoteKey: remoteKey ? remoteKey : groupName,
      });
    }

    setDestination(_destination);
  }

  function toggleUnlockedProperty(key) {
    const _unlockedProperties = Object.assign({}, unlockedProperties);
    _unlockedProperties[destination.mapping[key]] = _unlockedProperties[
      destination.mapping[key]
    ]
      ? false
      : true;
    setUnlockedProperties(_unlockedProperties);
  }

  function toggleUnlockedGroup(groupGuid) {
    const _unlockedGroups = [].concat(unlockedGroups);
    if (_unlockedGroups.includes(groupGuid)) {
      const index = _unlockedGroups.indexOf(groupGuid);
      _unlockedGroups.splice(index, 1);
    } else {
      _unlockedGroups.push(groupGuid);
    }
    setUnlockedGroups(_unlockedGroups);
  }

  const groupsAvailalbeForDestinationGroupMemberships = groups
    .filter(
      (group) =>
        !destination.destinationGroupMemberships
          .map((dgm) => dgm.groupGuid)
          .includes(group.guid)
    )
    .sort((a, b) => {
      if (a.name > b.name) return 1;
      if (a.name < b.name) return -1;
      return 0;
    })
    .sort((a, b) => {
      if (a.guid === trackedGroupGuid) return -1;
      return 1;
    });

  function filterRuleForArrayProperties(rule) {
    return rule.isArray
      ? exportArrayProperties.includes("*") ||
        exportArrayProperties.includes(rule.key)
        ? true
        : false
      : true;
  }

  return (
    <>
      <Head>
        <title>Grouparoo: {destination.name}</title>
      </Head>

      <DestinationTabs destination={destination} />

      <PageHeader
        icon={destination.app.icon}
        title={destination.name}
        badges={[
          <LockedBadge object={destination} />,
          <StateBadge state={destination.state} />,
        ]}
      />

      <Row>
        <Col>
          <Form id="form" onSubmit={update}>
            <fieldset disabled={destination.locked !== null}>
              <Row>
                <Col>
                  <h5>
                    Who should be sent to{" "}
                    <span className="text-primary">{destination.name}</span>?
                  </h5>
                  <Form.Control
                    as="select"
                    required={true}
                    value={trackedGroupGuid}
                    disabled={loading}
                    onChange={(e) => setTrackedGroupGuid(e.target["value"])}
                  >
                    <option value={"_none"}>No Group</option>
                    <option disabled>---</option>
                    {groups
                      .sort((a, b) => {
                        if (a.name >= b.name) {
                          return 1;
                        } else {
                          return -1;
                        }
                      })
                      .map((group) => (
                        <option key={`grp-${group.guid}`} value={group.guid}>
                          {group.name} ({group.profilesCount} members)
                        </option>
                      ))}
                  </Form.Control>
                </Col>
              </Row>

              <br />

              <Row>
                <Col>
                  <h5>
                    What data do you want in{" "}
                    <span className="text-primary">{destination.name}</span>?
                  </h5>

                  <br />

                  {/* Required Vars */}

                  {mappingOptions?.properties?.required.length > 0 ? (
                    <>
                      <h6>Required {mappingOptions.labels.property.plural}</h6>
                      <Table size="sm">
                        <thead>
                          <tr>
                            <th>Grouparoo Property</th>
                            <th />
                            <th>{mappingOptions.labels.property.singular}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {mappingOptions.properties.required.map(
                            ({ key, type }, idx) => (
                              <tr key={`required-mapping-${idx}`}>
                                <td>
                                  <Form.Control
                                    as="select"
                                    required={true}
                                    disabled={loading}
                                    value={destination.mapping[key] || ""}
                                    onChange={(e) =>
                                      updateMapping(key, e.target["value"])
                                    }
                                  >
                                    <option disabled value={""}>
                                      choose a Property
                                    </option>
                                    {properties
                                      .filter((rule) =>
                                        destinationTypeConversions[
                                          rule.type
                                        ].includes(type)
                                      )
                                      .filter((rule) => !rule.isArray)
                                      .filter(
                                        (rule) =>
                                          rule.key ===
                                            destination.mapping[key] ||
                                          !Object.values(
                                            destination.mapping
                                          ).includes(rule.key)
                                      )
                                      .map((rule) => (
                                        <option
                                          key={`opt-required-${rule.guid}`}
                                        >
                                          {rule.key}
                                        </option>
                                      ))}
                                  </Form.Control>
                                </td>
                                <td style={{ textAlign: "center" }}>→</td>
                                <td>
                                  <Badge variant="info">{key}</Badge>{" "}
                                  <span className="text-muted">({type})</span>
                                </td>
                              </tr>
                            )
                          )}
                        </tbody>
                      </Table>{" "}
                      <br />
                    </>
                  ) : null}

                  {/* Known Vars */}

                  {mappingOptions?.properties?.known.length > 0 ? (
                    <>
                      <h6>Known {mappingOptions.labels.property.plural}</h6>
                      <Table size="sm">
                        <thead>
                          <tr>
                            <th>Grouparoo Property</th>
                            <th />
                            <th>{mappingOptions.labels.property.singular}</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {mappingOptions.properties.known.map(
                            ({ key, type, important }, idx) =>
                              displayedDestinationProperties.includes(key) ||
                              important ||
                              destination.mapping[key] ? (
                                <tr key={`known-mapping-${idx}`}>
                                  <td>
                                    <Form.Control
                                      as="select"
                                      disabled={loading}
                                      required={false}
                                      value={destination.mapping[key] || ""}
                                      onChange={(e) =>
                                        updateMapping(key, e.target["value"])
                                      }
                                    >
                                      {!destination.mapping[key] ? (
                                        <option disabled value={""}>
                                          None
                                        </option>
                                      ) : null}
                                      {remainingPropertiesForKnown
                                        .filter((rule) =>
                                          destinationTypeConversions[
                                            rule.type
                                          ].includes(type)
                                        )
                                        .filter(filterRuleForArrayProperties)
                                        .filter(
                                          (rule) =>
                                            rule.key ===
                                              destination.mapping[key] ||
                                            !Object.values(
                                              destination.mapping
                                            ).includes(rule.key)
                                        )
                                        .map((rule) => (
                                          <option
                                            key={`opt-known-${rule.guid}`}
                                          >
                                            {rule.key}
                                          </option>
                                        ))}
                                    </Form.Control>
                                  </td>
                                  <td style={{ textAlign: "center" }}>→</td>
                                  <td>
                                    <Badge
                                      variant={
                                        destination.mapping[key]
                                          ? "info"
                                          : "dark"
                                      }
                                    >
                                      {key}
                                    </Badge>{" "}
                                    <span className="text-muted">({type})</span>
                                  </td>
                                  <td>
                                    {destination.mapping[key] ? (
                                      <Button
                                        size="sm"
                                        variant="danger"
                                        onClick={() => {
                                          updateMapping(key, "", key);
                                        }}
                                      >
                                        X
                                      </Button>
                                    ) : null}
                                  </td>
                                </tr>
                              ) : null
                          )}
                        </tbody>
                      </Table>

                      <Alert variant="light">
                        <Form.Group as={Row}>
                          <Form.Label column sm={3}>
                            <strong>Send Profile Property:</strong>
                          </Form.Label>
                          <Col>
                            <Typeahead
                              id="displayedDestinationProperties"
                              ref={displayedDestinationPropertiesAutocomleteRef}
                              placeholder={`Choose a ${mappingOptions.labels.property.singular}...`}
                              disabled={loading}
                              onChange={(selected) => {
                                displayedDestinationPropertiesAutocomleteRef.current.clear();

                                const _displayedDestinationProperties = [
                                  ...displayedDestinationProperties,
                                ];
                                _displayedDestinationProperties.push(
                                  selected[0]
                                );
                                setDisplayedDestinationProperties(
                                  _displayedDestinationProperties
                                );
                              }}
                              options={mappingOptions.properties.known
                                .filter(
                                  ({ key }) =>
                                    !displayedDestinationProperties.includes(
                                      key
                                    ) && !destination.mapping[key]
                                )
                                .filter(({ important }) => important !== true)
                                .map(({ key }) => key)}
                            />
                          </Col>
                        </Form.Group>
                      </Alert>
                    </>
                  ) : null}

                  {/* Optional Vars */}

                  {mappingOptions?.properties?.allowOptionalFromProperties ? (
                    <>
                      <h6>Optional {mappingOptions.labels.property.plural}</h6>
                      <Table size="sm">
                        <thead>
                          <tr>
                            <th>Grouparoo Property</th>
                            <th />
                            <th>{mappingOptions.labels.property.singular}</th>
                            <th />
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {optionalMappingRemoteKeys.map((key, idx) => (
                            <tr key={`optional-mapping-${idx}`}>
                              <td>
                                <Form.Control
                                  as="select"
                                  required={false}
                                  value={destination.mapping[key] || ""}
                                  disabled={loading}
                                  onChange={(e) =>
                                    updateMapping(
                                      e.target["value"],
                                      e.target["value"],
                                      key
                                    )
                                  }
                                >
                                  <option disabled value={""}>
                                    choose a Property
                                  </option>
                                  {remainingPropertyKeysForOptional
                                    .filter(
                                      (k) =>
                                        k === destination.mapping[key] ||
                                        !Object.values(
                                          destination.mapping
                                        ).includes(k)
                                    )
                                    .map((k) => (
                                      <option key={`opt-optional-${k}`}>
                                        {k}
                                      </option>
                                    ))}
                                </Form.Control>
                              </td>
                              <td style={{ textAlign: "center" }}>→</td>
                              <td>
                                <Form.Control
                                  required
                                  type="text"
                                  value={key}
                                  disabled={
                                    unlockedProperties[destination.mapping[key]]
                                      ? false
                                      : true
                                  }
                                  onChange={(e) =>
                                    updateMapping(
                                      e.target["value"],
                                      destination.mapping[key],
                                      key
                                    )
                                  }
                                />
                                <Form.Control.Feedback type="invalid">
                                  {mappingOptions.labels.property.singular} is
                                  required
                                </Form.Control.Feedback>
                              </td>
                              <td>
                                <Button
                                  size="sm"
                                  variant="light"
                                  onClick={() => toggleUnlockedProperty(key)}
                                >
                                  ✏️
                                </Button>
                              </td>
                              <td>
                                <Button
                                  size="sm"
                                  variant="danger"
                                  onClick={() => {
                                    updateMapping(null, null, key);
                                  }}
                                >
                                  X
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                      <Button
                        size="sm"
                        variant="outline-primary"
                        disabled={
                          properties.length === 0 ||
                          remainingPropertyKeysForOptional.filter(
                            (k) =>
                              !Object.values(destination.mapping).includes(k)
                          ).length === 0
                        }
                        onClick={() => {
                          updateMapping("new mapping", "");
                        }}
                      >
                        Add new {mappingOptions.labels.property.singular}
                      </Button>{" "}
                      <br />
                    </>
                  ) : null}

                  <br />

                  <h6>{mappingOptions?.labels?.group.plural}</h6>

                  <Table size="sm">
                    <thead>
                      <tr>
                        <th>Grouparoo Group</th>
                        <th />
                        <th>{mappingOptions?.labels?.group.singular}</th>
                        <th />
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {destination.destinationGroupMemberships.map(
                        ({ groupName, groupGuid, remoteKey }, idx) => (
                          <tr key={`optional-mapping-${idx}`}>
                            <td>
                              <Form.Control
                                as="select"
                                required={false}
                                value={groupGuid}
                                disabled={loading}
                                onChange={(e) =>
                                  updateDestinationGroupMembership(
                                    e.target["value"],
                                    null,
                                    groupGuid
                                  )
                                }
                              >
                                <option disabled value={""}>
                                  choose a group
                                </option>
                                {groups.map((group) => (
                                  <option
                                    value={group.guid}
                                    key={`group-remote-mapping-${group.guid}`}
                                  >
                                    {group.name}
                                  </option>
                                ))}
                              </Form.Control>
                            </td>
                            <td style={{ textAlign: "center" }}>→</td>
                            <td>
                              <Form.Control
                                required
                                type="text"
                                disabled={!unlockedGroups.includes(groupGuid)}
                                value={remoteKey}
                                onChange={(e) =>
                                  updateDestinationGroupMembership(
                                    groupGuid,
                                    e.target["value"]
                                  )
                                }
                              />
                              <Form.Control.Feedback type="invalid">
                                {mappingOptions?.labels?.group.singular} is
                                required
                              </Form.Control.Feedback>
                            </td>
                            <td>
                              <Button
                                size="sm"
                                variant="light"
                                onClick={() => toggleUnlockedGroup(groupGuid)}
                              >
                                ✏️
                              </Button>
                            </td>
                            <td>
                              <Button
                                size="sm"
                                variant="danger"
                                onClick={() => {
                                  updateDestinationGroupMembership(
                                    null,
                                    null,
                                    groupGuid
                                  );
                                }}
                              >
                                X
                              </Button>
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </Table>

                  <Alert variant="light">
                    <Form.Group as={Row}>
                      <Form.Label column sm={3}>
                        <strong>Send Group:</strong>
                      </Form.Label>
                      <Col>
                        <Typeahead
                          id="taggedGroup"
                          ref={taggedGroupRef}
                          disabled={
                            groupsAvailalbeForDestinationGroupMemberships.length ===
                            0
                          }
                          placeholder={`Choose a group...`}
                          onChange={(selected) => {
                            taggedGroupRef.current.clear();
                            const chosenGroup = groupsAvailalbeForDestinationGroupMemberships.filter(
                              (g) => g.name === selected[0]
                            )[0];

                            updateDestinationGroupMembership(
                              chosenGroup.guid,
                              chosenGroup.name
                            );
                          }}
                          options={groupsAvailalbeForDestinationGroupMemberships.map(
                            ({ name }) => name
                          )}
                        />
                      </Col>
                    </Form.Group>
                  </Alert>
                </Col>
              </Row>

              <Row>
                <Col>
                  <br />
                  <hr />
                  <LoadingButton
                    type="submit"
                    variant="primary"
                    disabled={loading}
                  >
                    Save Destination Data
                  </LoadingButton>
                </Col>
              </Row>
            </fieldset>
          </Form>
        </Col>
        <Col md={3}>
          <ProfilePreview
            {...props}
            mappingOptions={mappingOptions}
            destination={destination}
            groups={groups}
            trackedGroupGuid={trackedGroupGuid}
          />
        </Col>
      </Row>
    </>
  );
}

Page.getInitialProps = async (ctx) => {
  const { execApi } = useApi(ctx);
  const { guid } = ctx.query;
  const { destination } = await execApi("get", `/destination/${guid}`);
  const { groups } = await execApi("get", `/groups`);
  const { properties } = await execApi("get", `/properties`, {
    state: "ready",
  });

  let mappingOptions = {};
  let destinationTypeConversions = {};
  let exportArrayProperties = [];
  let hydrationError: Error;

  try {
    const mappingOptionsResponse = await execApi(
      "get",
      `/destination/${guid}/mappingOptions`
    );
    mappingOptions = mappingOptionsResponse.options;
    destinationTypeConversions =
      mappingOptionsResponse.destinationTypeConversions;

    const exportArrayPropertiesResponse = await execApi(
      "get",
      `/destination/${guid}/exportArrayProperties`
    );
    exportArrayProperties = exportArrayPropertiesResponse.exportArrayProperties;
  } catch (error) {
    hydrationError = error.toString();
  }

  return {
    destination,
    properties,
    mappingOptions,
    destinationTypeConversions,
    exportArrayProperties,
    trackedGroupGuid: destination.destinationGroup?.guid,
    groups: groups
      .filter((group) => group.state !== "draft")
      .filter((group) => group.state !== "deleted"),
    hydrationError,
  };
};