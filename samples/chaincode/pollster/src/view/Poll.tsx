import * as React from 'react';
import { ISharedMap } from '@prague/map';
import { OptionsList } from './PollOption';
import { ControlledInput } from './Input';
import { PollQuestion } from './PollQuestion';
import { aggregateVotes, AggregateVotesMap } from './utils';
import { mergeStyles } from 'office-ui-fabric-react';
import { PollStore, PollOptionInfo, VoteInfo } from './PollInterfaces';
import { pollQuestionKey } from '../PragueConstants';

const pollStyles = mergeStyles({
  minWidth: '200',
  boxShadow: '0 1.2px 3.6px 0 rgba(0, 0, 0, 0.11), 0 6.4px 14.4px 0 rgba(0, 0, 0, 0.13)',
  borderRadius: '5px',
  padding: '0 0.5em 0.2em 0.5em'
});

interface PollProps {
  pollStore: PollStore;
  clientId: string;
}

export type OptionsMap = Map<string, PollOptionInfo>;

export const Poll = React.memo((props: PollProps) => {
  const { pollStore, clientId } = props;

  const copyOptions = (optionsMap: ISharedMap): OptionsMap => {
    const copy: OptionsMap = new Map<string, PollOptionInfo>();

    optionsMap.forEach((value: PollOptionInfo, key: string) => {
      copy.set(key, value);
    });

    return copy;
  };

  const questionP = pollStore.rootMap.wait(pollQuestionKey);

  // State management
  const [question, setQuestion] = React.useState<string>(pollStore.rootMap.get<string>(pollQuestionKey) || '');
  const [votes, setVotes] = React.useState<AggregateVotesMap>(aggregateVotes(pollStore.votersMap));
  const [options, setOptions] = React.useState<OptionsMap>(copyOptions(pollStore.optionsMap));

  questionP.then((q: string) => {
    setQuestion(q);
  })

  const onSubmitQuestion = (newQuestionText: string) => {
    // Update root map with the question
    pollStore.rootMap.set<string>(pollQuestionKey, newQuestionText);
  };

  const onSubmitOption = (optionText: string) => {
    const newOption: PollOptionInfo = { content: optionText, id: optionText };
    // Update options map with the option info
    pollStore.optionsMap.set<PollOptionInfo>(newOption.id, newOption);
  };

  const onVote = (currentOptionId: string) => {
    const previousVote: VoteInfo | undefined = pollStore.votersMap.get(clientId);

    let voteInfo: VoteInfo = {
      clientId,
      previousOptionId: previousVote === undefined ? undefined : previousVote.currentOptionId,
      currentOptionId
    };

    // Update root map with the latest vote
    pollStore.votersMap.set<VoteInfo>(voteInfo.clientId, voteInfo);
  };

  let onRootMapValueChangedListener = () => {
    setQuestion(pollStore.rootMap.get(pollQuestionKey));
  };

  let onVotersMapValueChangedListener = () => {
    setVotes(aggregateVotes(pollStore.votersMap));
  };

  let onOptionsMapValueChangedListener = () => {
    setOptions(copyOptions(pollStore.optionsMap));
  };

  React.useEffect(() => {
    // Set listener for changes in maps
    pollStore.rootMap.on('valueChanged', onRootMapValueChangedListener);
    pollStore.votersMap.on('valueChanged', onVotersMapValueChangedListener);
    pollStore.optionsMap.on('valueChanged', onOptionsMapValueChangedListener);

    return () => {
      pollStore.rootMap.removeListener('valueChanged', onRootMapValueChangedListener);
      pollStore.votersMap.removeListener('valueChanged', onVotersMapValueChangedListener);
      pollStore.optionsMap.removeListener('valueChanged', onOptionsMapValueChangedListener);
    };
  }, []);

  return (
    <div className={pollStyles}>
      <PollQuestion question={question} onSubmitQuestion={onSubmitQuestion} />
      {question !== '' && (
        <div>
          <OptionsList options={options} votes={votes} onVote={onVote} />
          <ControlledInput placeholder={'Add an option'} submitValue={onSubmitOption} />
        </div>
      )}
    </div>
  );
});
