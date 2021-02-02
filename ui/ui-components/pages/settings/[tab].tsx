import Head from "next/head";
import { useState, useEffect } from "react";
import { useApi } from "../../hooks/useApi";
import { Tabs, Tab } from "react-bootstrap";
import { capitalize } from "../../components/tabs";
import { useRouter } from "next/router";
import { Models, Actions } from "../../utils/apiData";
import SettingCard from "../../components/settings/settingCard";
import ImportAndUpdateAllProfiles from "../../components/settings/importAndUpdate";
import IdentifyingProperty from "../../components/settings/identifyingProperty";
import ResetCluster from "../../components/settings/resetCluster";
import ClearCache from "../../components/settings/clearCache";

export default function Page(props) {
  const { errorHandler, successHandler, tab } = props;
  const router = useRouter();
  const { execApi } = useApi(props, errorHandler);
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<Models.SettingType[]>(
    props.settings
  );
  const [activeTab, setActiveTab] = useState(tab || "core");

  useEffect(() => {
    setActiveTab(tab);
  }, [tab]);

  async function updateSetting(setting) {
    setLoading(true);
    const response: Actions.SettingEdit = await execApi(
      "put",
      `/setting/${setting.guid}`,
      setting
    );
    setLoading(false);
    if (response?.setting) {
      const _settings = [...settings];
      for (const i in _settings) {
        if (_settings[i].guid === response.setting.guid) {
          _settings[i] = response.setting;
        }
      }
      setSettings(_settings);

      successHandler.set({ message: "Setting Updated" });
      window.location.reload(); // we want to hard-reload here because maybe the setting you just changed modifies the interface
    }
  }

  const pluginNames = [];
  settings.map((s) => {
    if (pluginNames.indexOf(s.pluginName) < 0) {
      pluginNames.push(s.pluginName);
    }
  });

  return (
    <>
      <Head>
        <title>Grouparoo: Settings</title>
      </Head>

      <h1>Settings</h1>

      <Tabs
        activeKey={activeTab}
        onSelect={(k) => router.push("/settings/[tab]", `/settings/${k}`)}
      >
        <Tab eventKey="actions" title="Actions">
          <ActionsTab
            errorHandler={errorHandler}
            successHandler={successHandler}
          />
        </Tab>

        {pluginNames.sort().map((pluginName) => (
          <Tab
            key={`plugin-${pluginName}`}
            eventKey={`${pluginName}`}
            title={capitalize(pluginName)}
          >
            <br />
            <h2>{capitalize(pluginName)}</h2>

            {/* Special Settings */}
            {pluginName === "interface" ? (
              <InterfaceTab
                errorHandler={errorHandler}
                successHandler={successHandler}
              />
            ) : null}

            {/* Regular Settings organized by Plugin */}
            {settings
              .sort((a, b) => {
                if (a.key > b.key) return 1;
                if (a.key < b.key) return -1;
              })
              .map((setting) =>
                setting.pluginName === pluginName ? (
                  <SettingCard
                    key={`team-${setting.guid}`}
                    setting={setting}
                    loading={loading}
                    updateSetting={updateSetting}
                  />
                ) : null
              )}
          </Tab>
        ))}
      </Tabs>
    </>
  );
}

Page.getInitialProps = async (ctx) => {
  const { tab } = ctx.query;
  const { execApi } = useApi(ctx);
  const { settings }: Actions.SettingsList = await execApi("get", `/settings`);
  return { settings, tab };
};

function ActionsTab({ errorHandler, successHandler }) {
  return (
    <>
      <br />
      <h2>Cluster Actions</h2>

      <br />

      <ImportAndUpdateAllProfiles
        errorHandler={errorHandler}
        successHandler={successHandler}
      />

      <br />

      <ClearCache errorHandler={errorHandler} successHandler={successHandler} />

      <br />

      <ResetCluster
        errorHandler={errorHandler}
        successHandler={successHandler}
      />
    </>
  );
}

function InterfaceTab({ errorHandler, successHandler }) {
  return (
    <>
      <IdentifyingProperty
        errorHandler={errorHandler}
        successHandler={successHandler}
      />
      <br />
    </>
  );
}